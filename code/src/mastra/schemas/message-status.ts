import { z } from 'zod';
import { getDbClient } from '../storage/db';

// Status values for message processing
export const messageStatusValue = z.enum(['pending', 'processing', 'completed', 'failed']);

export type MessageStatusValue = z.infer<typeof messageStatusValue>;

// Schema for message processing status
export const messageStatusSchema = z.object({
  id: z.string().describe('Message ID'),
  status: messageStatusValue.describe('Current processing status'),
  endpoint: z.string().describe('Endpoint the message came from'),
  filename: z.string().describe('Original filename'),
  createdAt: z.string().describe('When the message was detected'),
  processedAt: z.string().optional().describe('When processing completed'),
  error: z.string().optional().describe('Error message if failed'),
  summary: z.string().optional().describe('Processing summary'),
});

export type MessageStatus = z.infer<typeof messageStatusSchema>;

/**
 * Update or create a message status entry
 */
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

/**
 * Get message status by ID
 */
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

/**
 * Get all message statuses, optionally filtered by status value
 */
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

/**
 * Clear status store (for testing)
 */
export async function clearStatusStore(): Promise<void> {
  const db = getDbClient();
  await db.execute('DELETE FROM message_statuses');
}
