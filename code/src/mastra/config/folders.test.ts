import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FolderConfig, FolderEndpoint } from '../schemas/folder-config';

// We need to test with different environment variables, so we'll mock process.env
const originalEnv = { ...process.env };

describe('folders config', () => {
  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    // Clear module cache to allow re-importing with new env
    vi.resetModules();
  });

  describe('getMessagesRoot', () => {
    it('uses MESSAGES_ROOT env var when set', async () => {
      process.env.MESSAGES_ROOT = '/custom/messages/path';
      vi.resetModules();

      const { defaultFolderConfig } = await import('./folders');

      expect(defaultFolderConfig.rootPath).toBe('/custom/messages/path');
    });

    it('falls back to WORKSPACE_ROOT + .agents/messages', async () => {
      delete process.env.MESSAGES_ROOT;
      process.env.WORKSPACE_ROOT = '/my/workspace';
      vi.resetModules();

      const { defaultFolderConfig } = await import('./folders');

      expect(defaultFolderConfig.rootPath).toBe('/my/workspace/.agents/messages');
    });

    it('defaults to /workspaces/agent-ps/.agents/messages', async () => {
      delete process.env.MESSAGES_ROOT;
      delete process.env.WORKSPACE_ROOT;
      vi.resetModules();

      const { defaultFolderConfig } = await import('./folders');

      expect(defaultFolderConfig.rootPath).toBe('/workspaces/agent-ps/.agents/messages');
    });
  });

  describe('defaultFolderConfig', () => {
    it('has required endpoints', async () => {
      const { defaultFolderConfig } = await import('./folders');

      const endpointIds = defaultFolderConfig.endpoints.map(e => e.id);
      expect(endpointIds).toContain('inbox');
      expect(endpointIds).toContain('outbox');
      expect(endpointIds).toContain('bugs');
      expect(endpointIds).toContain('feature-requests');
    });

    it('configures inbox as inbox direction', async () => {
      const { defaultFolderConfig } = await import('./folders');

      const inbox = defaultFolderConfig.endpoints.find(e => e.id === 'inbox');
      expect(inbox?.direction).toBe('inbox');
    });

    it('configures outbox as outbox direction', async () => {
      const { defaultFolderConfig } = await import('./folders');

      const outbox = defaultFolderConfig.endpoints.find(e => e.id === 'outbox');
      expect(outbox?.direction).toBe('outbox');
    });

    it('has default frontmatter fields', async () => {
      const { defaultFolderConfig } = await import('./folders');

      const fieldNames = defaultFolderConfig.defaultFrontmatter?.map(f => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('timestamp');
    });

    it('configures polling mode for all endpoints', async () => {
      const { defaultFolderConfig } = await import('./folders');

      for (const endpoint of defaultFolderConfig.endpoints) {
        expect(endpoint.watchMode).toBe('poll');
      }
    });
  });

  describe('getEndpoint', () => {
    it('returns endpoint by id from default config', async () => {
      const { getEndpoint } = await import('./folders');

      const inbox = getEndpoint('inbox');
      expect(inbox).toBeDefined();
      expect(inbox?.id).toBe('inbox');
    });

    it('returns endpoint by id from custom config', async () => {
      const { getEndpoint } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/custom',
        endpoints: [
          { id: 'custom-endpoint', path: 'custom', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const endpoint = getEndpoint('custom-endpoint', customConfig);
      expect(endpoint?.id).toBe('custom-endpoint');
    });

    it('returns undefined for non-existent endpoint', async () => {
      const { getEndpoint } = await import('./folders');

      const endpoint = getEndpoint('non-existent');
      expect(endpoint).toBeUndefined();
    });
  });

  describe('getEndpointPath', () => {
    it('returns full path for endpoint', async () => {
      const { getEndpointPath } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root/messages',
        endpoints: [
          { id: 'inbox', path: 'inbox', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const path = getEndpointPath('inbox', customConfig);
      expect(path).toBe('/root/messages/inbox');
    });

    it('throws error for non-existent endpoint', async () => {
      const { getEndpointPath } = await import('./folders');

      expect(() => getEndpointPath('non-existent')).toThrow('Endpoint not found');
    });

    it('handles nested endpoint paths', async () => {
      const { getEndpointPath } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'nested', path: 'deep/nested/path', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const path = getEndpointPath('nested', customConfig);
      expect(path).toBe('/root/deep/nested/path');
    });
  });

  describe('listEndpoints', () => {
    it('returns all endpoints from default config', async () => {
      const { listEndpoints, defaultFolderConfig } = await import('./folders');

      const endpoints = listEndpoints();
      expect(endpoints.length).toBe(defaultFolderConfig.endpoints.length);
    });

    it('returns all endpoints from custom config', async () => {
      const { listEndpoints } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'a', path: 'a', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'b', path: 'b', direction: 'outbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const endpoints = listEndpoints(customConfig);
      expect(endpoints.length).toBe(2);
      expect(endpoints.map(e => e.id)).toEqual(['a', 'b']);
    });
  });

  describe('getInboxEndpoints', () => {
    it('returns only inbox-direction endpoints', async () => {
      const { getInboxEndpoints } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'inbox1', path: 'inbox1', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'outbox', path: 'outbox', direction: 'outbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'inbox2', path: 'inbox2', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const inboxEndpoints = getInboxEndpoints(customConfig);
      expect(inboxEndpoints.length).toBe(2);
      expect(inboxEndpoints.every(e => e.direction === 'inbox')).toBe(true);
    });

    it('includes bidirectional endpoints', async () => {
      const { getInboxEndpoints } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'inbox', path: 'inbox', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'bidirectional', path: 'both', direction: 'bidirectional', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'outbox', path: 'outbox', direction: 'outbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const inboxEndpoints = getInboxEndpoints(customConfig);
      expect(inboxEndpoints.length).toBe(2);
      expect(inboxEndpoints.map(e => e.id)).toContain('bidirectional');
    });

    it('returns empty array when no inbox endpoints', async () => {
      const { getInboxEndpoints } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'outbox', path: 'outbox', direction: 'outbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const inboxEndpoints = getInboxEndpoints(customConfig);
      expect(inboxEndpoints.length).toBe(0);
    });
  });

  describe('getDefaultOutboxEndpoint', () => {
    it('returns first outbox endpoint', async () => {
      const { getDefaultOutboxEndpoint } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'inbox', path: 'inbox', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
          { id: 'outbox', path: 'outbox', direction: 'outbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const outbox = getDefaultOutboxEndpoint(customConfig);
      expect(outbox?.id).toBe('outbox');
    });

    it('returns undefined when no outbox endpoint', async () => {
      const { getDefaultOutboxEndpoint } = await import('./folders');

      const customConfig: FolderConfig = {
        rootPath: '/root',
        endpoints: [
          { id: 'inbox', path: 'inbox', direction: 'inbox', pattern: '*.md', requiredFrontmatter: [], watchMode: 'poll', pollIntervalMs: 1000 },
        ],
      };

      const outbox = getDefaultOutboxEndpoint(customConfig);
      expect(outbox).toBeUndefined();
    });

    it('uses default config when not provided', async () => {
      const { getDefaultOutboxEndpoint } = await import('./folders');

      const outbox = getDefaultOutboxEndpoint();
      expect(outbox?.id).toBe('outbox');
    });
  });
});
