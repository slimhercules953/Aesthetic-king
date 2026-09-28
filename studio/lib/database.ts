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