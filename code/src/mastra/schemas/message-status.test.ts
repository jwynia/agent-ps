import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  messageStatusSchema,
  messageStatusValue,
} from './message-status';

// We'll mock the db module and test the async functions
vi.mock('../storage/db', () => {
  const mockRows: Map<string, Record<string, unknown>> = new Map();

  return {
    getDbClient: () => ({
      execute: vi.fn(async (queryOrObj: string | { sql: string; args?: unknown[] }) => {
        const sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
        const args = typeof queryOrObj === 'string' ? [] : (queryOrObj.args ?? []);

        // Handle INSERT OR REPLACE
        if (sql.includes('INSERT OR REPLACE')) {
          const [id, status, endpoint, filename, created_at, processed_at, error, summary] = args as string[];
          mockRows.set(id, { id, status, endpoint, filename, created_at, processed_at, error, summary });
          return { rows: [] };
        }

        // Handle SELECT by ID
        if (sql.includes('WHERE id = ?')) {
          const id = args[0] as string;
          const row = mockRows.get(id);
          return { rows: row ? [row] : [] };
        }

        // Handle SELECT all with optional status filter
        if (sql.includes('SELECT * FROM message_statuses')) {
          let rows = Array.from(mockRows.values());
          if (sql.includes('WHERE status = ?')) {
            const filterStatus = args[0] as string;
            rows = rows.filter(r => r.status === filterStatus);
          }
          // Sort by created_at DESC
          rows.sort((a, b) => {
            const aTime = a.created_at as string;
            const bTime = b.created_at as string;
            return bTime.localeCompare(aTime);
          });
          return { rows };
        }

        // Handle DELETE
        if (sql.includes('DELETE FROM message_statuses')) {
          mockRows.clear();
          return { rows: [] };
        }

        return { rows: [] };
      }),
    }),
    // Expose the mock rows map for test setup/cleanup
    __mockRows: mockRows,
  };
});

// Import after mocking
import {
  updateMessageStatus,
  getMessageStatus,
  getAllMessageStatuses,
  clearStatusStore,
} from './message-status';

// Access the mock rows map
const getMockRows = async () => {
  const db = await import('../storage/db');
  return (db as unknown as { __mockRows: Map<string, unknown> }).__mockRows;
};

describe('messageStatusValue', () => {
  it('accepts valid status values', () => {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'] as const;
    for (const status of validStatuses) {
      expect(() => messageStatusValue.parse(status)).not.toThrow();
    }
  });

  it('rejects invalid status values', () => {
    expect(() => messageStatusValue.parse('invalid')).toThrow();
    expect(() => messageStatusValue.parse('PENDING')).toThrow(); // case sensitive
    expect(() => messageStatusValue.parse('')).toThrow();
  });
});

describe('messageStatusSchema', () => {
  it('validates a pending status', () => {
    const status = {
      id: 'msg-123',
      status: 'pending',
      endpoint: 'inbox',
      filename: 'msg-123.md',
      createdAt: '2026-01-19T12:00:00Z',
    };
    const result = messageStatusSchema.parse(status);
    expect(result.id).toBe('msg-123');
    expect(result.status).toBe('pending');
  });

  it('validates a completed status with all fields', () => {
    const status = {
      id: 'msg-456',
      status: 'completed',
      endpoint: 'bugs',
      filename: 'bug-report.md',
      createdAt: '2026-01-19T12:00:00Z',
      processedAt: '2026-01-19T12:00:05Z',
      summary: 'Processed successfully',
    };
    const result = messageStatusSchema.parse(status);
    expect(result.processedAt).toBe('2026-01-19T12:00:05Z');
    expect(result.summary).toBe('Processed successfully');
  });

  it('validates a failed status with error', () => {
    const status = {
      id: 'msg-789',
      status: 'failed',
      endpoint: 'inbox',
      filename: 'invalid.md',
      createdAt: '2026-01-19T12:00:00Z',
      processedAt: '2026-01-19T12:00:01Z',
      error: 'Missing required frontmatter: id',
    };
    const result = messageStatusSchema.parse(status);
    expect(result.error).toContain('frontmatter');
  });

  it('rejects status missing required fields', () => {
    const status = {
      id: 'msg-123',
      status: 'pending',
      // missing endpoint, filename, createdAt
    };
    expect(() => messageStatusSchema.parse(status)).toThrow();
  });
});

describe('async status functions', () => {
  beforeEach(async () => {
    const mockRows = await getMockRows();
    mockRows.clear();
  });

  describe('updateMessageStatus', () => {
    it('creates a new status entry', async () => {
      const status = {
        id: 'new-msg',
        status: 'pending' as const,
        endpoint: 'inbox',
        filename: 'new-msg.md',
        createdAt: '2026-01-19T12:00:00Z',
      };

      await updateMessageStatus(status);
      const result = await getMessageStatus('new-msg');

      expect(result).toBeDefined();
      expect(result!.id).toBe('new-msg');
      expect(result!.status).toBe('pending');
    });

    it('updates an existing status entry', async () => {
      // Create initial status
      await updateMessageStatus({
        id: 'update-msg',
        status: 'pending',
        endpoint: 'inbox',
        filename: 'update-msg.md',
        createdAt: '2026-01-19T12:00:00Z',
      });

      // Update to processing
      await updateMessageStatus({
        id: 'update-msg',
        status: 'processing',
        endpoint: 'inbox',
        filename: 'update-msg.md',
        createdAt: '2026-01-19T12:00:00Z',
      });

      const result = await getMessageStatus('update-msg');
      expect(result!.status).toBe('processing');
    });

    it('handles optional fields', async () => {
      await updateMessageStatus({
        id: 'optional-msg',
        status: 'completed',
        endpoint: 'inbox',
        filename: 'optional-msg.md',
        createdAt: '2026-01-19T12:00:00Z',
        processedAt: '2026-01-19T12:00:05Z',
        summary: 'Done',
      });

      const result = await getMessageStatus('optional-msg');
      expect(result!.processedAt).toBe('2026-01-19T12:00:05Z');
      expect(result!.summary).toBe('Done');
    });
  });

  describe('getMessageStatus', () => {
    it('returns undefined for non-existent message', async () => {
      const result = await getMessageStatus('non-existent');
      expect(result).toBeUndefined();
    });

    it('returns the status for existing message', async () => {
      await updateMessageStatus({
        id: 'existing-msg',
        status: 'completed',
        endpoint: 'inbox',
        filename: 'existing.md',
        createdAt: '2026-01-19T12:00:00Z',
      });

      const result = await getMessageStatus('existing-msg');
      expect(result).toBeDefined();
      expect(result!.id).toBe('existing-msg');
    });
  });

  describe('getAllMessageStatuses', () => {
    beforeEach(async () => {
      // Add multiple test statuses
      await updateMessageStatus({
        id: 'msg-1',
        status: 'pending',
        endpoint: 'inbox',
        filename: 'msg-1.md',
        createdAt: '2026-01-19T12:00:00Z',
      });
      await updateMessageStatus({
        id: 'msg-2',
        status: 'completed',
        endpoint: 'inbox',
        filename: 'msg-2.md',
        createdAt: '2026-01-19T12:01:00Z',
      });
      await updateMessageStatus({
        id: 'msg-3',
        status: 'failed',
        endpoint: 'bugs',
        filename: 'msg-3.md',
        createdAt: '2026-01-19T12:02:00Z',
        error: 'Test error',
      });
    });

    it('returns all statuses when no filter provided', async () => {
      const result = await getAllMessageStatuses();
      expect(result).toHaveLength(3);
    });

    it('filters by status value', async () => {
      const pendingOnly = await getAllMessageStatuses('pending');
      expect(pendingOnly).toHaveLength(1);
      expect(pendingOnly[0].id).toBe('msg-1');

      const completedOnly = await getAllMessageStatuses('completed');
      expect(completedOnly).toHaveLength(1);
      expect(completedOnly[0].id).toBe('msg-2');
    });

    it('returns empty array when filter matches nothing', async () => {
      const processingOnly = await getAllMessageStatuses('processing');
      expect(processingOnly).toHaveLength(0);
    });

    it('returns results sorted by createdAt descending', async () => {
      const result = await getAllMessageStatuses();
      // Most recent first
      expect(result[0].id).toBe('msg-3');
      expect(result[1].id).toBe('msg-2');
      expect(result[2].id).toBe('msg-1');
    });
  });

  describe('clearStatusStore', () => {
    it('removes all status entries', async () => {
      // Add some statuses
      await updateMessageStatus({
        id: 'clear-test-1',
        status: 'pending',
        endpoint: 'inbox',
        filename: 'test.md',
        createdAt: '2026-01-19T12:00:00Z',
      });
      await updateMessageStatus({
        id: 'clear-test-2',
        status: 'completed',
        endpoint: 'inbox',
        filename: 'test2.md',
        createdAt: '2026-01-19T12:01:00Z',
      });

      // Clear the store
      await clearStatusStore();

      // Verify empty
      const result = await getAllMessageStatuses();
      expect(result).toHaveLength(0);
    });
  });
});
