import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageWriter } from './message-writer';
import type { FolderConfig } from '../schemas/folder-config';

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';

describe('MessageWriter', () => {
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
    defaultFrontmatter: [],
  };

  let writer: MessageWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-19T12:00:00Z'));
    writer = new MessageWriter(testConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('write', () => {
    it('writes message to correct endpoint path', async () => {
      const filePath = await writer.write({
        endpointId: 'inbox',
        content: 'Test message',
      });

      expect(filePath).toBe('/test/messages/inbox/test-uuid-1234.md');
      expect(mkdir).toHaveBeenCalledWith('/test/messages/inbox', { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        '/test/messages/inbox/test-uuid-1234.md',
        expect.any(String),
        'utf-8'
      );
    });

    it('generates UUID for message id', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test message',
      });

      expect(randomUUID).toHaveBeenCalled();
      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('id: "test-uuid-1234"');
    });

    it('adds timestamp to frontmatter', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test message',
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('timestamp: "2026-01-19T12:00:00.000Z"');
    });

    it('includes custom frontmatter', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test message',
        frontmatter: {
          from: 'user@example.com',
          subject: 'Test Subject',
          priority: 'high',
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('from: "user@example.com"');
      expect(writtenContent).toContain('subject: "Test Subject"');
      expect(writtenContent).toContain('priority: "high"');
    });

    it('uses custom filename when provided', async () => {
      const filePath = await writer.write({
        endpointId: 'inbox',
        content: 'Test message',
        filename: 'custom-name.md',
      });

      expect(filePath).toBe('/test/messages/inbox/custom-name.md');
    });

    it('writes content after frontmatter', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'This is the message body.\n\nWith multiple paragraphs.',
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('---\n');
      expect(writtenContent).toContain('\n---\n\n');
      expect(writtenContent).toContain('This is the message body.');
      expect(writtenContent).toContain('With multiple paragraphs.');
    });

    it('throws error for unknown endpoint', async () => {
      await expect(
        writer.write({
          endpointId: 'unknown',
          content: 'Test message',
        })
      ).rejects.toThrow('Endpoint not found: unknown');
    });

    it('creates directory before writing', async () => {
      await writer.write({
        endpointId: 'outbox',
        content: 'Response message',
      });

      // mkdir should be called before writeFile
      const mkdirCall = (mkdir as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      const writeFileCall = (writeFile as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      expect(mkdirCall).toBeLessThan(writeFileCall);
    });

    it('handles frontmatter with special characters', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test',
        frontmatter: {
          subject: 'Hello "World"',
          note: "It's a test",
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      // JSON.stringify should properly escape quotes
      expect(writtenContent).toContain('subject: "Hello \\"World\\""');
      expect(writtenContent).toContain("note: \"It's a test\"");
    });

    it('returns full file path', async () => {
      const filePath = await writer.write({
        endpointId: 'bugs',
        content: 'Bug report',
        frontmatter: { severity: 'high' },
      });

      expect(filePath).toBe('/test/messages/bugs/test-uuid-1234.md');
    });

    it('handles numeric frontmatter values', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test',
        frontmatter: {
          count: 42,
          rating: 4.5,
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('count: 42');
      expect(writtenContent).toContain('rating: 4.5');
    });

    it('handles boolean frontmatter values', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test',
        frontmatter: {
          urgent: true,
          archived: false,
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('urgent: true');
      expect(writtenContent).toContain('archived: false');
    });

    it('handles array frontmatter values', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test',
        frontmatter: {
          tags: ['bug', 'urgent', 'backend'],
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('tags: ["bug","urgent","backend"]');
    });

    it('custom frontmatter overrides defaults', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Test',
        frontmatter: {
          id: 'custom-id-override',
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      // The custom id should appear (the UUID id is added first, then custom overwrites)
      expect(writtenContent).toContain('id: "custom-id-override"');
    });
  });

  describe('file format', () => {
    it('creates valid YAML frontmatter format', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Body content',
        frontmatter: {
          from: 'test@example.com',
        },
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;

      // Should start with ---
      expect(writtenContent.startsWith('---\n')).toBe(true);

      // Should have closing --- before content
      const parts = writtenContent.split('---');
      expect(parts.length).toBe(3); // empty before first ---, frontmatter, content
      expect(parts[2].trim()).toBe('Body content');
    });

    it('separates frontmatter from content with blank line', async () => {
      await writer.write({
        endpointId: 'inbox',
        content: 'Content here',
      });

      const writtenContent = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      expect(writtenContent).toContain('---\n\nContent here');
    });
  });
});
