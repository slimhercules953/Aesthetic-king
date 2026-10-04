import { env } from "cloudflare:workers";
import { Client, Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * A single pooled client per isolate.
 *
 * This used to build a brand-new `pg.Client`, connect it, run one
 * statement and tear it down for *every* query. On localhost that costs
 * roughly 74ms of TCP plus PostgreSQL startup plus auth per call;
 * against the real Hyperdrive endpoint it costs a cross-region round
 * trip several times over, because connecting is at least two round
 * trips before the query itself can start. A page that issued three
 * queries paid for three connections and got one query out of each.
 *
 * A pool keeps connections warm instead, so a query costs one round
 * trip. Hyperdrive is built for exactly this: it multiplexes many
 * pooled clients from many isolates onto a small pool of real
 * PostgreSQL backends.
 *
 * The promise is memoised rather than built at module scope because
 * `env` bindings are not reliably readable during module
 * initialization, and a module that throws at import time takes the
 * whole Worker down instead of failing one request.
 */
let poolPromise: Promise<Pool> | null = null;

/**
 * Postgres SQLSTATE classes for a connection that is gone, plus the
 * libuv socket codes `pg` surfaces when the write never left the
 * process. Everything here means the statement did not reach the
 * server, which is what makes it safe to try again.
 */
const DEAD_CONNECTION_CODES = new Set([
    "08000", // exception_on_connection
    "08001", // sqlclient_unable_to_establish_sqlconnection
    "08003", // connection_does_not_exist
    "08004", // sqlserver_rejected_establishment_of_sqlconnection
    "08006", // connection_failure
    "08P01", // protocol_violation (a half-written message after a drop)
    "57P01", // admin_shutdown
    "57P02", // crash_shutdown
    "57P03", // cannot_connect_now
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "ENOTFOUND",
]);

/**
 * True when the failure means "that socket was already dead" rather
 * than "the database rejected what you asked for".
 *
 * The distinction decides whether a retry is safe. A statement that
 * never reached the server can be re-sent; a constraint violation
 * re-sent is a second failed write.
 */
function isDeadConnection(error: unknown): boolean {
    const candidate = error as { code?: string; message?: string } | null;

    if (candidate?.code && DEAD_CONNECTION_CODES.has(candidate.code)) {
        return true;
    }

    return /network connection lost|connection terminated unexpectedly|client has encountered a connection error|socket hang up/i.test(
        candidate?.message ?? "",
    );
}

/**
 * True for the local Hyperdrive emulator, whose connection string points
 * at a `*.hyperdrive.local` host the real service never issues.
 */
function isLocalHyperdrive(connectionString: string): boolean {
  return /\.hyperdrive\.local\b/i.test(connectionString);
}

function createPool(): Pool {
  const connectionString = env.HYPERDRIVE.connectionString;

  const pool = new Pool({
    connectionString,

    // Per isolate. Hyperdrive caps the total number of backends across
    // all isolates, so this is a ceiling on one isolate's share of the
    // database, not on the database itself.
    max: 10,

    // A request that has waited this long for a free connection is
    // already far past any useful latency, so fail it rather than queue
    // indefinitely behind a saturated pool.
    connectionTimeoutMillis: 10_000,

    // Hand idle connections back reasonably quickly so a burst of
    // traffic does not hold the backend pool hostage.
    idleTimeoutMillis: 30_000,

  });

  // A pooled connection can die at any moment: Hyperdrive recycling a
  // backend, a brief network blip. pg emits `error` on the pool for a
  // connection that fails while idle, and without a listener Node
  // treats it as an unhandled error and kills the isolate — turning one
  // dead socket into a failure for every in-flight request. pg removes
  // the bad connection from the pool by itself, so logging is all that
  // is left to do.
  pool.on("error", (error) => {
    console.error("Idle database connection error:", error);
  });

  return pool;
}

/**
 * A pool plus whether the caller owns it.
 *
 * `ephemeral` pools must be `end`ed by the call that asked for them.
 */
interface PoolHandle {
  pool: Pool;
  ephemeral: boolean;
}

/**
 * The local Hyperdrive emulator cannot share sockets between requests.
 *
 * Under workerd a socket belongs to the I/O context of the request that
 * opened it. Once that request settles the socket stops being serviced,
 * so a pooled connection left over from an earlier request neither works
 * nor errors — the next statement simply never resolves, and the runtime
 * cancels the request with "your Worker's code had hung". The real
 * Hyperdrive proxy has no such restriction, which is why this only
 * applies to the `*.hyperdrive.local` emulator string.
 *
 * Paying for a fresh connection per query locally (~70ms) is the correct
 * trade: it matches what production avoids by pooling, and production
 * keeps the pool.
 */
async function getPool(): Promise<PoolHandle> {
  const connectionString = env.HYPERDRIVE.connectionString;

  if (isLocalHyperdrive(connectionString)) {
    return { pool: createPool(), ephemeral: true };
  }

  if (!poolPromise) {
    poolPromise = Promise.resolve(createPool()).catch((error) => {
      // Never cache a pool that failed to build; the next request
      // should get the chance to make a working one.
      poolPromise = null;

      throw error;
    });
  }

  return { pool: await poolPromise, ephemeral: false };
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const { pool, ephemeral } = await getPool();

  /*
   * Deliberately not retried. Once `pool.query` has been called there is
   * no way to tell "the socket was dead before the statement left" from
   * "the server received it and then dropped the reply", and re-sending
   * an INSERT on that ambiguity duplicates rows. Writes that matter are
   * already inside `withTransaction`, which can retry safely.
   */
  try {
    return await pool.query<T>(text, values);
  } finally {
    if (ephemeral) {
      await pool.end().catch(() => undefined);
    }
  }
}

/**
 * Runs `work` inside a single BEGIN/COMMIT, handing it a client that
 * is scoped to that transaction.
 *
 * Crown spending depends on this: the balance check and the ledger
 * insert must be atomic, otherwise concurrent requests can both pass
 * the check and overdraw the account.
 *
 * The callback receives a `Client` rather than the narrow `query`
 * helper so that callers can also use `client.query` for statements
 * that need row locks. Never call the module-level `query()` inside the
 * callback — it checks out a *different* connection that is NOT part of
 * this transaction.
 *
 * The client is checked out for the duration of the transaction and
 * then released. It must be released rather than `end`ed: ending a
 * pooled client destroys a connection the rest of the isolate still
 * wants.
 */
export async function withTransaction<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const { pool, ephemeral } = await getPool();

  /*
   * A pooled connection that has been sitting idle can already be dead
   * by the time the pool hands it over: Hyperdrive recycles backends it
   * considers idle, and the local Hyperdrive emulator drops idle
   * sockets outright. `pool.connect()` does not notice, so the first
   * statement is what fails.
   *
   * That is worth one retry, but only while nothing of ours has run. If
   * the failure lands on checkout or on BEGIN then no statement of this
   * transaction reached the server, so trying again cannot duplicate a
   * write; once `BEGIN` has succeeded the transaction is live and the
   * error is surfaced instead. Retrying blindly here would risk
   * spending Crowns twice, which is the one failure mode this whole
   * helper exists to prevent.
   */
  try {
    for (let attempt = 0; ; attempt++) {
      let client: PoolClient | null = null;
      let begun = false;
      let failed: unknown = null;

      try {
        client = await pool.connect();

        await client.query("BEGIN");
        begun = true;

        const result = await work(client);

        await client.query("COMMIT");

        return result;
      } catch (error) {
        failed = error;

        if (client && begun) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // The connection is already broken; surfacing the original
            // error is more useful than masking it with this one.
          }
        }
      } finally {
        if (client) {
          /*
           * Always released, on success too. A client left checked out is
           * a connection the pool can never hand to anyone else, and with
           * a bounded pool that eventually starves every later request.
           *
           * Passing the error on a failure tells the pool the connection
           * is untrustworthy and it should destroy it rather than hand it
           * to the next caller.
           */
          client.release(
            failed instanceof Error ? failed : failed ? new Error(String(failed)) : undefined,
          );
        }
      }

      /*
       * Only reachable when the attempt failed. Retry once, and only if
       * the socket was dead before `BEGIN` ran.
       */
      if (begun || attempt > 0 || !isDeadConnection(failed)) {
        throw failed;
      }
    }
  } finally {
    if (ephemeral) {
      await pool.end().catch(() => undefined);
    }
  }
}
