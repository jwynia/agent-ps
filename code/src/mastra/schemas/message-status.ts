import { z } from 'zod';

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

// In-memory store for message statuses (could be replaced with persistent storage)
const statusStore = new Map<string, MessageStatus>();

/**
 * Update or create a message status entry
 */
export function updateMessageStatus(status: MessageStatus): void {
  statusStore.set(status.id, status);
}

/**
 * Get message status by ID
 */
export function getMessageStatus(id: string): MessageStatus | undefined {
  return statusStore.get(id);
}

/**
 * Get all message statuses, optionally filtered by status value
 */
export function getAllMessageStatuses(filterStatus?: MessageStatusValue): MessageStatus[] {
  const all = Array.from(statusStore.values());
  if (filterStatus) {
    return all.filter(s => s.status === filterStatus);
  }
  return all;
}

/**
 * Clear status store (for testing)
 */
export function clearStatusStore(): void {
  statusStore.clear();
}
