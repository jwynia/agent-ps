import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { FolderConfig } from '../schemas/folder-config';
import type { FolderEvent, Message } from '../schemas/message';

// Mock status store - must be outside vi.mock to be accessible
const mockStatusStore: Map<string, unknown> = new Map();

// Mock the message-status module
vi.mock('../schemas/message-status', () => ({
  updateMessageStatus: vi.fn(async (status: { id: string }) => {
    mockStatusStore.set(status.id, status);
  }),
  getMessageStatus: vi.fn(async (id: string) => mockStatusStore.get(id)),
  getAllMessageStatuses: vi.fn(async () => Array.from(mockStatusStore.values())),
  clearStatusStore: vi.fn(async () => mockStatusStore.clear()),
}));

// Mock the folders config
vi.mock('../config/folders', () => ({
  getInboxEndpoints: vi.fn((config: FolderConfig) =>
    config.endpoints.filter((e: { direction: string }) => e.direction === 'inbox' || e.direction === 'bidirectional')
  ),
  defaultFolderConfig: {
    rootPath: '/test/messages',
    endpoints: [
      { id: 'inbox', path: 'inbox', direction: 'inbox' },
      { id: 'outbox', path: 'outbox', direction: 'outbox' },
    ],
  },
}));

// Mock the MessageRouter - create a class-like mock
const mockRouteMessageFn = vi.fn();
vi.mock('../config/message-router', () => {
  return {
    MessageRouter: class MockMessageRouter {
      findRoute = vi.fn();
      routeMessage = mockRouteMessageFn;
      constructor(_mastra: unknown, _config?: unknown) {}
    },
    defaultRouterConfig: {
      routes: [],
      defaultHandler: { handlerType: 'agent', handlerId: 'defaultAgent' },
    },
  };
});

// Mock the FolderWatcher - class defined inside factory to avoid hoisting issues
vi.mock('./folder-watcher', () => {
  const { EventEmitter } = require('events');

  class MockFolderWatcher extends EventEmitter {
    constructor(_config: unknown) {
      super();
    }

    async start(): Promise<void> {
      // No-op for testing
    }

    async stop(): Promise<void> {
      // No-op for testing
    }
  }

  return { FolderWatcher: MockFolderWatcher };
});

// Import after mocking
import { MessageProcessor } from './message-processor';
import { updateMessageStatus, getMessageStatus } from '../schemas/message-status';
import type { Mastra } from '@mastra/core/mastra';

// Type for our mock watcher with the methods we need
interface MockWatcher extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
}

describe('MessageProcessor', () => {
  const testConfig: FolderConfig = {
    rootPath: '/test/messages',
    endpoints: [
      {
        id: 'inbox',
        path: 'inbox',
        pattern: '**/*.md',
        direction: 'inbox',
        requiredFrontmatter: [],
        watchMode: 'poll',
        pollIntervalMs: 1000,
      },
      {
        id: 'outbox',
        path: 'outbox',
        pattern: '**/*.md',
        direction: 'outbox',
        requiredFrontmatter: [],
        watchMode: 'poll',
        pollIntervalMs: 1000,
      },
      {
        id: 'bugs',
        path: 'bugs',
        pattern: '**/*.md',
        direction: 'inbox',
        requiredFrontmatter: [],
        watchMode: 'poll',
        pollIntervalMs: 1000,
      },
    ],
    defaultFrontmatter: [],
  };

  const mockMastra = {
    getAgent: vi.fn(),
    getWorkflow: vi.fn(),
  } as unknown as Mastra;

  let processor: MessageProcessor;
  let mockWatcher: MockWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusStore.clear();
    mockRouteMessageFn.mockResolvedValue({ handler: 'testAgent', result: 'Processed' });

    processor = new MessageProcessor(testConfig, mockMastra);
    // Access the internal watcher
    mockWatcher = (processor as unknown as { watcher: MockWatcher }).watcher;
  });

  afterEach(async () => {
    await processor.stop();
  });

  // Helper to simulate events
  function simulateEvent(event: FolderEvent): void {
    mockWatcher.emit('message', event);
  }

  function simulateError(error: Error): void {
    mockWatcher.emit('error', error);
  }

  describe('start and stop', () => {
    it('starts without error', async () => {
      await expect(processor.start()).resolves.not.toThrow();
    });

    it('stops without error', async () => {
      await processor.start();
      await expect(processor.stop()).resolves.not.toThrow();
    });
  });

  describe('message:created event handling', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('processes new messages and updates status to completed', async () => {
      const message: Message = {
        id: 'msg-123',
        filePath: '/test/messages/inbox/msg-123.md',
        endpointId: 'inbox',
        frontmatter: { id: 'msg-123', type: 'question' },
        content: 'Test content',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      const event: FolderEvent = {
        type: 'message:created',
        message,
      };

      simulateEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have called updateMessageStatus multiple times (pending -> processing -> completed)
      expect(updateMessageStatus).toHaveBeenCalled();

      // Final status should be completed
      const finalStatus = await getMessageStatus('msg-123');
      expect(finalStatus).toBeDefined();
      expect((finalStatus as { status: string }).status).toBe('completed');
    });

    it('routes message through MessageRouter', async () => {
      const message: Message = {
        id: 'route-test',
        filePath: '/test/messages/inbox/route-test.md',
        endpointId: 'inbox',
        frontmatter: { id: 'route-test', type: 'task' },
        content: 'Route me',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRouteMessageFn).toHaveBeenCalledWith(
        'route-test.md',
        'inbox',
        'task'
      );
    });

    it('updates status to failed when routing fails', async () => {
      mockRouteMessageFn.mockRejectedValueOnce(new Error('Agent not found'));

      const message: Message = {
        id: 'fail-test',
        filePath: '/test/messages/inbox/fail-test.md',
        endpointId: 'inbox',
        frontmatter: { id: 'fail-test' },
        content: 'This will fail',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      const finalStatus = await getMessageStatus('fail-test');
      expect(finalStatus).toBeDefined();
      expect((finalStatus as { status: string; error?: string }).status).toBe('failed');
      expect((finalStatus as { error?: string }).error).toContain('Agent not found');
    });

    it('extracts message type from frontmatter', async () => {
      const message: Message = {
        id: 'type-test',
        filePath: '/test/messages/bugs/type-test.md',
        endpointId: 'bugs',
        frontmatter: { id: 'type-test', type: 'bug-report' },
        content: 'Bug description',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRouteMessageFn).toHaveBeenCalledWith(
        'type-test.md',
        'bugs',
        'bug-report'
      );
    });

    it('handles messages without type in frontmatter', async () => {
      const message: Message = {
        id: 'no-type',
        filePath: '/test/messages/inbox/no-type.md',
        endpointId: 'inbox',
        frontmatter: { id: 'no-type' }, // No type field
        content: 'Generic message',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRouteMessageFn).toHaveBeenCalledWith(
        'no-type.md',
        'inbox',
        undefined
      );
    });

    it('stores processing summary from router result', async () => {
      mockRouteMessageFn.mockResolvedValueOnce({
        handler: 'testAgent',
        result: 'Processed and responded',
      });

      const message: Message = {
        id: 'summary-test',
        filePath: '/test/messages/inbox/summary-test.md',
        endpointId: 'inbox',
        frontmatter: { id: 'summary-test' },
        content: 'Test',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      const status = await getMessageStatus('summary-test');
      expect((status as { summary?: string }).summary).toBe('Processed and responded');
    });
  });

  describe('message:updated event handling', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('logs updated messages but does not reprocess', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const message: Message = {
        id: 'update-test',
        filePath: '/test/messages/inbox/update-test.md',
        endpointId: 'inbox',
        frontmatter: { id: 'update-test' },
        content: 'Updated content',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:updated', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Updated message')
      );
      // Should not route updated messages
      expect(mockRouteMessageFn).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('message:deleted event handling', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('logs deleted messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      simulateEvent({
        type: 'message:deleted',
        filePath: '/test/messages/inbox/deleted.md',
        endpointId: 'inbox',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted message')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error event handling', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('logs parsing errors from folder events', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      simulateEvent({
        type: 'error',
        filePath: '/test/messages/inbox/invalid.md',
        error: 'Missing required frontmatter: id',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing')
      );

      consoleSpy.mockRestore();
    });

    it('logs watcher errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      simulateError(new Error('File system error'));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Folder watcher error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('status progression', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('progresses through pending -> processing -> completed', async () => {
      const statusCalls: Array<{ status: string }> = [];
      (updateMessageStatus as ReturnType<typeof vi.fn>).mockImplementation(async (status: { id: string; status: string }) => {
        statusCalls.push({ status: status.status });
        mockStatusStore.set(status.id, status);
      });

      const message: Message = {
        id: 'progression-test',
        filePath: '/test/messages/inbox/progression-test.md',
        endpointId: 'inbox',
        frontmatter: { id: 'progression-test' },
        content: 'Test',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have status updates in order
      expect(statusCalls.map(s => s.status)).toEqual(['pending', 'processing', 'completed']);
    });

    it('progresses through pending -> processing -> failed on error', async () => {
      mockRouteMessageFn.mockRejectedValueOnce(new Error('Processing error'));

      const statusCalls: Array<{ status: string }> = [];
      (updateMessageStatus as ReturnType<typeof vi.fn>).mockImplementation(async (status: { id: string; status: string }) => {
        statusCalls.push({ status: status.status });
        mockStatusStore.set(status.id, status);
      });

      const message: Message = {
        id: 'fail-progression',
        filePath: '/test/messages/inbox/fail-progression.md',
        endpointId: 'inbox',
        frontmatter: { id: 'fail-progression' },
        content: 'Test',
        createdAt: new Date(),
        modifiedAt: new Date(),
      };

      simulateEvent({ type: 'message:created', message });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(statusCalls.map(s => s.status)).toEqual(['pending', 'processing', 'failed']);
    });
  });

  describe('concurrent message processing', () => {
    beforeEach(async () => {
      await processor.start();
    });

    it('handles multiple messages concurrently', async () => {
      // Make routing take some time
      mockRouteMessageFn.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { handler: 'testAgent', result: 'Done' };
      });

      const messages = ['msg-1', 'msg-2', 'msg-3'].map(id => ({
        id,
        filePath: `/test/messages/inbox/${id}.md`,
        endpointId: 'inbox',
        frontmatter: { id },
        content: 'Test',
        createdAt: new Date(),
        modifiedAt: new Date(),
      }));

      // Emit all messages quickly
      for (const message of messages) {
        simulateEvent({ type: 'message:created', message });
      }

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // All should have been processed
      for (const msg of messages) {
        const status = await getMessageStatus(msg.id);
        expect(status).toBeDefined();
        expect((status as { status: string }).status).toBe('completed');
      }
    });
  });
});

// Test the legacy export alias
describe('InboxProcessor alias', () => {
  it('exports MessageProcessor as InboxProcessor for backwards compatibility', async () => {
    const { InboxProcessor, MessageProcessor: MP } = await import('./message-processor');
    expect(InboxProcessor).toBe(MP);
  });
});
