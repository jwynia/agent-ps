import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { FolderConfig } from '../schemas/folder-config';

// Mock chokidar
const mockWatcher = new EventEmitter() as EventEmitter & {
  close: ReturnType<typeof vi.fn>;
};
mockWatcher.close = vi.fn().mockResolvedValue(undefined);

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      // Emit ready after a tick
      setTimeout(() => mockWatcher.emit('ready'), 0);
      return mockWatcher;
    }),
  },
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

// Import after mocking
import { FolderWatcher } from './folder-watcher';
import { readFile, stat } from 'fs/promises';
import chokidar from 'chokidar';

describe('FolderWatcher', () => {
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
        requiredFrontmatter: [
          { name: 'severity', type: 'string', required: true },
        ],
        watchMode: 'poll',
        pollIntervalMs: 1000,
      },
    ],
    defaultFrontmatter: [
      { name: 'id', type: 'string', required: true },
      { name: 'timestamp', type: 'date', required: true },
    ],
  };

  let watcher: FolderWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher.removeAllListeners();
    watcher = new FolderWatcher(testConfig);
  });

  afterEach(async () => {
    await watcher.stop();
  });

  describe('start', () => {
    it('creates watchers for inbox endpoints only', async () => {
      await watcher.start();

      // Should watch inbox and bugs (both direction: inbox), but not outbox
      expect(chokidar.watch).toHaveBeenCalledTimes(2);
    });

    it('does not create duplicate watchers when called twice', async () => {
      await watcher.start();
      await watcher.start();

      expect(chokidar.watch).toHaveBeenCalledTimes(2);
    });

    it('configures watcher with correct options', async () => {
      await watcher.start();

      expect(chokidar.watch).toHaveBeenCalledWith(
        '/test/messages/inbox',
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
          usePolling: true,
        })
      );
    });
  });

  describe('stop', () => {
    it('closes all watchers', async () => {
      await watcher.start();
      await watcher.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('can be called multiple times safely', async () => {
      await watcher.start();
      await watcher.stop();
      await watcher.stop();

      // Should not throw
    });
  });

  describe('file events', () => {
    const mockFileContent = `---
id: "msg-123"
timestamp: "2026-01-19T12:00:00Z"
from: "user@example.com"
---

Test message content`;

    const mockStats = {
      birthtime: new Date('2026-01-19T12:00:00Z'),
      mtime: new Date('2026-01-19T12:00:00Z'),
    };

    beforeEach(async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockFileContent);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats);
      await watcher.start();
    });

    it('emits message:created event for new markdown files', async () => {
      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/msg-123.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'message:created',
        message: expect.objectContaining({
          id: 'msg-123',
          endpointId: 'inbox',
          content: 'Test message content',
        }),
      });
    });

    it('emits message:updated event for changed files', async () => {
      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('change', '/test/messages/inbox/msg-123.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'message:updated',
      });
    });

    it('emits message:deleted event for removed files', async () => {
      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('unlink', '/test/messages/inbox/msg-123.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'message:deleted',
        filePath: '/test/messages/inbox/msg-123.md',
        endpointId: 'inbox',
      });
    });

    it('ignores non-markdown files', async () => {
      const messageHandler = vi.fn();
      watcher.on('message', messageHandler);

      mockWatcher.emit('add', '/test/messages/inbox/file.txt');
      mockWatcher.emit('change', '/test/messages/inbox/file.json');
      mockWatcher.emit('unlink', '/test/messages/inbox/file.yaml');

      // Give time for async handlers
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('emits error event when file parsing fails', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Read error'));

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/bad-file.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'error',
        filePath: '/test/messages/inbox/bad-file.md',
        error: 'Read error',
      });
    });
  });

  describe('frontmatter validation', () => {
    beforeEach(async () => {
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        birthtime: new Date(),
        mtime: new Date(),
      });
      await watcher.start();
    });

    it('emits error when required frontmatter is missing', async () => {
      // Missing required 'id' field from defaultFrontmatter
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
timestamp: "2026-01-19T12:00:00Z"
---

Content without id`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/no-id.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'error',
        error: expect.stringContaining('id'),
      });
    });

    it('accepts file with all required frontmatter', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "valid-msg"
timestamp: "2026-01-19T12:00:00Z"
---

Valid content`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/valid.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'message:created',
      });
    });

    it('validates endpoint-specific required frontmatter', async () => {
      // Create a new watcher to get fresh event handlers on the mock
      const bugsWatcher = new FolderWatcher({
        ...testConfig,
        endpoints: [testConfig.endpoints[2]], // bugs endpoint only
      });

      // Missing severity required for bugs endpoint
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "bug-123"
timestamp: "2026-01-19T12:00:00Z"
---

Bug without severity`);

      await bugsWatcher.start();

      const messagePromise = new Promise((resolve) => {
        bugsWatcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/bugs/bug.md');

      const event = await messagePromise;
      expect(event).toMatchObject({
        type: 'error',
        error: expect.stringContaining('severity'),
      });

      await bugsWatcher.stop();
    });
  });

  describe('message parsing', () => {
    beforeEach(async () => {
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        birthtime: new Date('2026-01-19T10:00:00Z'),
        mtime: new Date('2026-01-19T11:00:00Z'),
      });
      await watcher.start();
    });

    it('extracts frontmatter fields correctly', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "test-id"
timestamp: "2026-01-19T12:00:00Z"
from: "sender@example.com"
subject: "Test Subject"
customField: 42
---

Body content here`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/test.md');

      const event = (await messagePromise) as { message: { frontmatter: Record<string, unknown>; content: string } };
      expect(event.message.frontmatter.from).toBe('sender@example.com');
      expect(event.message.frontmatter.subject).toBe('Test Subject');
      expect(event.message.frontmatter.customField).toBe(42);
      expect(event.message.content).toBe('Body content here');
    });

    it('uses frontmatter id when available', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "custom-id-from-frontmatter"
timestamp: "2026-01-19T12:00:00Z"
---

Message with custom id`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/any-file.md');

      const event = (await messagePromise) as { message: { id: string } };
      expect(event.message.id).toBe('custom-id-from-frontmatter');
    });

    it('trims content whitespace', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "trim-test"
timestamp: "2026-01-19T12:00:00Z"
---

   Content with whitespace

`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/trim.md');

      const event = (await messagePromise) as { message: { content: string } };
      expect(event.message.content).toBe('Content with whitespace');
    });

    it('uses file stats for timestamps', async () => {
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(`---
id: "stats-test"
timestamp: "2026-01-19T12:00:00Z"
---

Content`);

      const messagePromise = new Promise((resolve) => {
        watcher.on('message', resolve);
      });

      mockWatcher.emit('add', '/test/messages/inbox/stats.md');

      const event = (await messagePromise) as { message: { createdAt: Date; modifiedAt: Date } };
      expect(event.message.createdAt).toEqual(new Date('2026-01-19T10:00:00Z'));
      expect(event.message.modifiedAt).toEqual(new Date('2026-01-19T11:00:00Z'));
    });
  });

  describe('watcher error handling', () => {
    it('emits error event from chokidar errors', async () => {
      await watcher.start();

      const errorPromise = new Promise((resolve) => {
        watcher.on('error', resolve);
      });

      const testError = new Error('Watcher error');
      mockWatcher.emit('error', testError);

      const error = await errorPromise;
      expect(error).toBe(testError);
    });
  });
});
