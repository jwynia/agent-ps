# TASK-006: Persistent Message Status Storage

## Status: completed
## Priority: medium
## Size: medium
## Created: 2026-01-19

## Description

Replace the in-memory message status store (`Map<string, MessageStatus>`) with persistent storage using LibSQL. The project already uses `@mastra/libsql` for Mastra storage, so this extends that pattern.

Currently, message processing status is lost when the server restarts. Persistence enables:
- Audit trail of all processed messages
- Recovery after crashes (know what was in-progress)
- Status queries across sessions
- Historical analysis

## Acceptance Criteria

- [x] Create message_statuses table in LibSQL
- [x] Migrate `updateMessageStatus()` to write to DB
- [x] Migrate `getMessageStatus()` to read from DB
- [x] Migrate `getAllMessageStatuses()` to query from DB
- [x] Maintain backward compatibility with existing API
- [x] Status survives server restart
- [x] Index on status field for efficient filtering
- [ ] Tests for CRUD operations

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- TASK-005 should be done first to validate current flow works

## Implementation Plan

### Step 1: Create database connection utility

**File:** `code/src/mastra/storage/db.ts`

```typescript
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
```

### Step 2: Update message-status.ts

**File:** `code/src/mastra/schemas/message-status.ts`

Replace in-memory Map with LibSQL operations:

```typescript
import { z } from 'zod';
import { getDbClient } from '../storage/db';

// Schema stays the same
export const messageStatusValue = z.enum(['pending', 'processing', 'completed', 'failed']);
export type MessageStatusValue = z.infer<typeof messageStatusValue>;

export const messageStatusSchema = z.object({
  id: z.string(),
  status: messageStatusValue,
  endpoint: z.string(),
  filename: z.string(),
  createdAt: z.string(),
  processedAt: z.string().optional(),
  error: z.string().optional(),
  summary: z.string().optional(),
});

export type MessageStatus = z.infer<typeof messageStatusSchema>;

export async function updateMessageStatus(status: MessageStatus): Promise<void> {
  const db = getDbClient();

  await db.execute({
    sql: `
      INSERT OR REPLACE INTO message_statuses
      (id, status, endpoint, filename, created_at, processed_at, error, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      status.id,
      status.status,
      status.endpoint,
      status.filename,
      status.createdAt,
      status.processedAt ?? null,
      status.error ?? null,
      status.summary ?? null,
    ],
  });
}

export async function getMessageStatus(id: string): Promise<MessageStatus | undefined> {
  const db = getDbClient();

  const result = await db.execute({
    sql: 'SELECT * FROM message_statuses WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return undefined;

  const row = result.rows[0];
  return {
    id: row.id as string,
    status: row.status as MessageStatusValue,
    endpoint: row.endpoint as string,
    filename: row.filename as string,
    createdAt: row.created_at as string,
    processedAt: row.processed_at as string | undefined,
    error: row.error as string | undefined,
    summary: row.summary as string | undefined,
  };
}

export async function getAllMessageStatuses(
  filterStatus?: MessageStatusValue
): Promise<MessageStatus[]> {
  const db = getDbClient();

  const sql = filterStatus
    ? 'SELECT * FROM message_statuses WHERE status = ? ORDER BY created_at DESC'
    : 'SELECT * FROM message_statuses ORDER BY created_at DESC';

  const result = await db.execute({
    sql,
    args: filterStatus ? [filterStatus] : [],
  });

  return result.rows.map(row => ({
    id: row.id as string,
    status: row.status as MessageStatusValue,
    endpoint: row.endpoint as string,
    filename: row.filename as string,
    createdAt: row.created_at as string,
    processedAt: row.processed_at as string | undefined,
    error: row.error as string | undefined,
    summary: row.summary as string | undefined,
  }));
}

// Keep for testing, clears DB table
export async function clearStatusStore(): Promise<void> {
  const db = getDbClient();
  await db.execute('DELETE FROM message_statuses');
}
```

### Step 3: Update message-processor.ts

Make status updates async:

```typescript
// Change from:
updateMessageStatus(status);

// To:
await updateMessageStatus(status);
```

### Step 4: Initialize DB on startup

**File:** `code/src/mastra/index.ts` - Add initialization:

```typescript
import { initializeDb } from './storage/db';

// Initialize database before starting processor
await initializeDb();
```

### Step 5: Create data directory

```bash
mkdir -p .agents/data
echo ".agents/data/*.db" >> .gitignore
```

### Step 6: Update status-tools.ts

Make tool execute functions async for DB queries.

## Verification

```bash
cd code
npm run dev

# Drop a test message
echo '---
id: persist-test
timestamp: 2026-01-19T12:00:00Z
from: test
subject: Persistence test
---
Test message' > ../.agents/messages/inbox/persist-test.md

# Stop server (Ctrl+C)
# Restart server
npm run dev

# Query statuses via MCP or status tools
# Should see persist-test in completed statuses
```

## Patterns to Follow

- Use LibSQL client pattern from `@mastra/libsql`
- Maintain same function signatures for backward compatibility
- Use parameterized queries (never string interpolation)
- Handle null/undefined fields properly

## Related

- [schemas/message-status.ts](../../code/src/mastra/schemas/message-status.ts) - Current in-memory implementation
- TASK-005 (validates current flow before migration)
