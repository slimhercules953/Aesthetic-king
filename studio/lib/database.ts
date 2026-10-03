import { env } from "cloudflare:workers";
import { Client, QueryResult, QueryResultRow } from "pg";

async function createClient(): Promise<Client> {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
  });

  await client.connect();

  return client;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const client = await createClient();

  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
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
 * that need row locks. Never call the module-level `query()` inside
 * the callback — it opens a separate connection that is NOT part of
 * this transaction.
 */
export async function withTransaction<T>(
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await createClient();

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
      // error is more useful than masking it with this one.
    }

    throw error;
  } finally {
    await client.end();
  }
}