import { describe, it, expect } from 'vitest';
import { messageSchema, folderEventSchema } from './message';

describe('messageSchema', () => {
  it('validates a complete message', () => {
    const message = {
      id: 'msg-123',
      filePath: '/workspaces/agent-ps/.agents/messages/inbox/msg-123.md',
      endpointId: 'inbox',
      frontmatter: {
        id: 'msg-123',
        from: 'user@example.com',
        subject: 'Test message',
        timestamp: '2026-01-19T12:00:00Z',
      },
      content: 'This is the message body.',
      createdAt: new Date('2026-01-19T12:00:00Z'),
      modifiedAt: new Date('2026-01-19T12:00:00Z'),
    };
    const result = messageSchema.parse(message);
    expect(result.id).toBe('msg-123');
    expect(result.endpointId).toBe('inbox');
    expect(result.frontmatter.from).toBe('user@example.com');
  });

  it('validates message with minimal frontmatter', () => {
    const message = {
      id: 'msg-456',
      filePath: '/path/to/msg-456.md',
      endpointId: 'inbox',
      frontmatter: {},
      content: '',
      createdAt: new Date(),
      modifiedAt: new Date(),
    };
    expect(() => messageSchema.parse(message)).not.toThrow();
  });

  it('rejects message missing required fields', () => {
    const message = {
      id: 'msg-789',
      // missing filePath, endpointId, etc.
    };
    expect(() => messageSchema.parse(message)).toThrow();
  });

  it('accepts Date objects for timestamps', () => {
    const now = new Date();
    const message = {
      id: 'msg-date',
      filePath: '/path/to/file.md',
      endpointId: 'inbox',
      frontmatter: {},
      content: 'Content',
      createdAt: now,
      modifiedAt: now,
    };
    const result = messageSchema.parse(message);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.modifiedAt).toBeInstanceOf(Date);
  });

  it('allows arbitrary frontmatter keys', () => {
    const message = {
      id: 'msg-custom',
      filePath: '/path/to/file.md',
      endpointId: 'bugs',
      frontmatter: {
        severity: 'high',
        customField: 123,
        nested: { key: 'value' },
        tags: ['urgent', 'backend'],
      },
      content: 'Bug description',
      createdAt: new Date(),
      modifiedAt: new Date(),
    };
    const result = messageSchema.parse(message);
    expect(result.frontmatter.severity).toBe('high');
    expect(result.frontmatter.customField).toBe(123);
    expect((result.frontmatter.nested as { key: string }).key).toBe('value');
  });
});

describe('folderEventSchema', () => {
  describe('message:created event', () => {
    it('validates a created event', () => {
      const event = {
        type: 'message:created',
        message: {
          id: 'msg-123',
          filePath: '/path/to/msg.md',
          endpointId: 'inbox',
          frontmatter: { id: 'msg-123' },
          content: 'Hello',
          createdAt: new Date(),
          modifiedAt: new Date(),
        },
      };
      const result = folderEventSchema.parse(event);
      expect(result.type).toBe('message:created');
      expect(result.message.id).toBe('msg-123');
    });
  });

  describe('message:updated event', () => {
    it('validates an updated event', () => {
      const event = {
        type: 'message:updated',
        message: {
          id: 'msg-123',
          filePath: '/path/to/msg.md',
          endpointId: 'inbox',
          frontmatter: {},
          content: 'Updated content',
          createdAt: new Date(),
          modifiedAt: new Date(),
        },
      };
      const result = folderEventSchema.parse(event);
      expect(result.type).toBe('message:updated');
    });
  });

  describe('message:deleted event', () => {
    it('validates a deleted event', () => {
      const event = {
        type: 'message:deleted',
        filePath: '/path/to/deleted.md',
        endpointId: 'inbox',
      };
      const result = folderEventSchema.parse(event);
      expect(result.type).toBe('message:deleted');
      expect(result.filePath).toBe('/path/to/deleted.md');
      expect(result.endpointId).toBe('inbox');
    });

    it('rejects deleted event missing filePath', () => {
      const event = {
        type: 'message:deleted',
        endpointId: 'inbox',
      };
      expect(() => folderEventSchema.parse(event)).toThrow();
    });
  });

  describe('error event', () => {
    it('validates an error event', () => {
      const event = {
        type: 'error',
        filePath: '/path/to/invalid.md',
        error: 'Missing required frontmatter field: id',
      };
      const result = folderEventSchema.parse(event);
      expect(result.type).toBe('error');
      expect(result.error).toContain('frontmatter');
    });

    it('rejects error event missing error message', () => {
      const event = {
        type: 'error',
        filePath: '/path/to/file.md',
      };
      expect(() => folderEventSchema.parse(event)).toThrow();
    });
  });

  it('rejects invalid event type', () => {
    const event = {
      type: 'invalid-event',
      data: {},
    };
    expect(() => folderEventSchema.parse(event)).toThrow();
  });
});
