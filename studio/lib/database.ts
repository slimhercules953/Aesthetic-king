import { env } from "cloudflare:workers";
import { Client, Pool, QueryResult, QueryResultRow } from "pg";

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
 * initialisation, and a module that throws at import time takes the
 * whole Worker down instead of failing one request.
 */
let poolPromise: Promise<Pool> | null = null;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.HYPERDRIVE.connectionString,

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

function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = Promise.resolve(createPool()).catch((error) => {
      // Never cache a pool that failed to build; the next request
      // should get the chance to make a working one.
      poolPromise = null;

      throw error;
    });
  }

  return poolPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const pool = await getPool();

  return pool.query<T>(text, values);
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
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await work(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already broken; surfacing the original
      // error is more useful than masking it with this one. The pool
      // discards the connection when it is released.
    }

    throw error;
  } finally {
    client.release();
  }
}
