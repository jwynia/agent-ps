import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getDbClient(): Client {
  if (!client) {
    client = createClient({
      url: process.env.LIBSQL_URL ?? 'file:../.agents/data/agent-ps.db',
    });
  }
  return client;
}

export async function initializeDb(): Promise<void> {
  const db = getDbClient();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_statuses (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      error TEXT,
      summary TEXT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_status
    ON message_statuses(status)
  `);
}
