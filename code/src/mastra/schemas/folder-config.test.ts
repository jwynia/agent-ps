import { describe, it, expect } from 'vitest';
import {
  folderConfigSchema,
  folderEndpointSchema,
  frontmatterFieldSchema,
} from './folder-config';

describe('frontmatterFieldSchema', () => {
  it('validates a complete frontmatter field definition', () => {
    const field = {
      name: 'id',
      type: 'string',
      required: true,
      description: 'Unique identifier',
    };
    const result = frontmatterFieldSchema.parse(field);
    expect(result.name).toBe('id');
    expect(result.type).toBe('string');
    expect(result.required).toBe(true);
    expect(result.description).toBe('Unique identifier');
  });

  it('applies default for required field', () => {
    const field = {
      name: 'optional',
      type: 'string',
    };
    const result = frontmatterFieldSchema.parse(field);
    expect(result.required).toBe(false);
  });

  it('rejects invalid type values', () => {
    const field = {
      name: 'test',
      type: 'invalid-type',
    };
    expect(() => frontmatterFieldSchema.parse(field)).toThrow();
  });

  it('validates all supported type values', () => {
    const types = ['string', 'number', 'date', 'boolean', 'array'] as const;
    for (const type of types) {
      const field = { name: 'test', type };
      expect(() => frontmatterFieldSchema.parse(field)).not.toThrow();
    }
  });
});

describe('folderEndpointSchema', () => {
  it('validates a minimal inbox endpoint', () => {
    const endpoint = {
      id: 'inbox',
      path: 'inbox',
      direction: 'inbox',
    };
    const result = folderEndpointSchema.parse(endpoint);
    expect(result.id).toBe('inbox');
    expect(result.path).toBe('inbox');
    expect(result.direction).toBe('inbox');
  });

  it('applies defaults for optional fields', () => {
    const endpoint = {
      id: 'inbox',
      path: 'inbox',
      direction: 'inbox',
    };
    const result = folderEndpointSchema.parse(endpoint);
    expect(result.pattern).toBe('**/*.md');
    expect(result.watchMode).toBe('fsevents');
    expect(result.pollIntervalMs).toBe(5000);
    expect(result.requiredFrontmatter).toEqual([]);
  });

  it('validates a fully configured endpoint', () => {
    const endpoint = {
      id: 'bugs',
      path: 'bugs',
      pattern: '*.md',
      direction: 'inbox',
      requiredFrontmatter: [
        { name: 'severity', type: 'string', required: true },
      ],
      watchMode: 'poll',
      pollIntervalMs: 2000,
    };
    const result = folderEndpointSchema.parse(endpoint);
    expect(result.id).toBe('bugs');
    expect(result.watchMode).toBe('poll');
    expect(result.pollIntervalMs).toBe(2000);
    expect(result.requiredFrontmatter).toHaveLength(1);
  });

  it('rejects missing required fields', () => {
    const endpoint = { id: 'inbox' };
    expect(() => folderEndpointSchema.parse(endpoint)).toThrow();
  });

  it('validates direction enum values', () => {
    const validDirections = ['inbox', 'outbox', 'bidirectional'] as const;
    for (const direction of validDirections) {
      const endpoint = { id: 'test', path: 'test', direction };
      expect(() => folderEndpointSchema.parse(endpoint)).not.toThrow();
    }
  });

  it('rejects invalid direction value', () => {
    const endpoint = {
      id: 'test',
      path: 'test',
      direction: 'invalid',
    };
    expect(() => folderEndpointSchema.parse(endpoint)).toThrow();
  });

  it('validates watchMode enum values', () => {
    const validModes = ['poll', 'fsevents'] as const;
    for (const watchMode of validModes) {
      const endpoint = { id: 'test', path: 'test', direction: 'inbox', watchMode };
      expect(() => folderEndpointSchema.parse(endpoint)).not.toThrow();
    }
  });
});

describe('folderConfigSchema', () => {
  it('validates a complete config with one endpoint', () => {
    const config = {
      rootPath: '.agents/messages',
      endpoints: [{ id: 'inbox', path: 'inbox', direction: 'inbox' }],
    };
    const result = folderConfigSchema.parse(config);
    expect(result.rootPath).toBe('.agents/messages');
    expect(result.endpoints).toHaveLength(1);
  });

  it('applies default frontmatter fields', () => {
    const config = {
      rootPath: '.agents/messages',
      endpoints: [{ id: 'inbox', path: 'inbox', direction: 'inbox' }],
    };
    const result = folderConfigSchema.parse(config);
    expect(result.defaultFrontmatter).toBeDefined();
    expect(result.defaultFrontmatter!.length).toBeGreaterThan(0);

    // Check that required defaults are present
    const fieldNames = result.defaultFrontmatter!.map(f => f.name);
    expect(fieldNames).toContain('id');
    expect(fieldNames).toContain('timestamp');
  });

  it('validates config with multiple endpoints', () => {
    const config = {
      rootPath: '/var/messages',
      endpoints: [
        { id: 'inbox', path: 'inbox', direction: 'inbox' },
        { id: 'outbox', path: 'outbox', direction: 'outbox' },
        { id: 'bugs', path: 'bugs', direction: 'bidirectional' },
      ],
    };
    const result = folderConfigSchema.parse(config);
    expect(result.endpoints).toHaveLength(3);
  });

  it('rejects config with empty endpoints array', () => {
    const config = {
      rootPath: '.agents/messages',
      endpoints: [],
    };
    expect(() => folderConfigSchema.parse(config)).toThrow();
  });

  it('rejects config without rootPath', () => {
    const config = {
      endpoints: [{ id: 'inbox', path: 'inbox', direction: 'inbox' }],
    };
    expect(() => folderConfigSchema.parse(config)).toThrow();
  });

  it('allows custom defaultFrontmatter', () => {
    const config = {
      rootPath: '.agents/messages',
      endpoints: [{ id: 'inbox', path: 'inbox', direction: 'inbox' }],
      defaultFrontmatter: [
        { name: 'custom', type: 'string', required: true },
      ],
    };
    const result = folderConfigSchema.parse(config);
    expect(result.defaultFrontmatter).toHaveLength(1);
    expect(result.defaultFrontmatter![0].name).toBe('custom');
  });
});
