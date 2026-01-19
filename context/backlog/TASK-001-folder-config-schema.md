# TASK-001: Define Folder Endpoint Configuration Schema

## Status: completed
## Priority: high
## Size: medium
## Created: 2026-01-19
## Completed: 2026-01-19

## Description

Define the configuration schema for folder endpoints that agents will use to exchange messages. This schema determines how folders are mapped to endpoints and what metadata is required.

## Acceptance Criteria

- [x] TypeScript interface for folder endpoint configuration
- [x] Zod schema for runtime validation
- [x] Support for multiple folders (inbox, outbox, custom folders like /bugs, /feature-requests)
- [x] Configuration for file patterns (e.g., *.md)
- [x] Optional metadata requirements (YAML frontmatter fields)

## Base Directory

All implementation work happens in `/code`.

## Implementation Plan

### Step 1: Create schema file

**File:** `code/src/mastra/schemas/folder-config.ts`

```typescript
import { z } from 'zod';

// Schema for required YAML frontmatter fields
export const frontmatterFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean', 'array']),
  required: z.boolean().default(false),
  description: z.string().optional(),
});

// Schema for a single folder endpoint
export const folderEndpointSchema = z.object({
  id: z.string().describe('Unique identifier for this endpoint'),
  path: z.string().describe('Relative path from agents folder root'),
  pattern: z.string().default('**/*.md').describe('Glob pattern for files'),
  direction: z.enum(['inbox', 'outbox', 'bidirectional']).default('inbox'),
  requiredFrontmatter: z.array(frontmatterFieldSchema).default([]),
  watchMode: z.enum(['poll', 'fsevents']).default('fsevents'),
  pollIntervalMs: z.number().default(5000).describe('Poll interval if using poll mode'),
});

// Schema for the complete folder configuration
export const folderConfigSchema = z.object({
  rootPath: z.string().describe('Base path for all agent folders'),
  endpoints: z.array(folderEndpointSchema).min(1),
  defaultFrontmatter: z.array(frontmatterFieldSchema).default([
    { name: 'id', type: 'string', required: true },
    { name: 'timestamp', type: 'date', required: true },
    { name: 'from', type: 'string', required: false },
    { name: 'replyTo', type: 'string', required: false },
  ]),
});

// TypeScript types derived from schemas
export type FrontmatterField = z.infer<typeof frontmatterFieldSchema>;
export type FolderEndpoint = z.infer<typeof folderEndpointSchema>;
export type FolderConfig = z.infer<typeof folderConfigSchema>;
```

### Step 2: Create default configuration

**File:** `code/src/mastra/config/folders.ts`

```typescript
import { FolderConfig } from '../schemas/folder-config';

export const defaultFolderConfig: FolderConfig = {
  rootPath: '../.agents/messages',
  endpoints: [
    {
      id: 'inbox',
      path: 'inbox',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
    },
    {
      id: 'outbox',
      path: 'outbox',
      pattern: '**/*.md',
      direction: 'outbox',
      requiredFrontmatter: [],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
    },
  ],
  defaultFrontmatter: [
    { name: 'id', type: 'string', required: true },
    { name: 'timestamp', type: 'date', required: true },
    { name: 'from', type: 'string', required: false },
    { name: 'replyTo', type: 'string', required: false },
  ],
};
```

### Step 3: Update barrel exports

**File:** `code/src/mastra/index.ts` - Add exports:

```typescript
export { folderConfigSchema, folderEndpointSchema, frontmatterFieldSchema } from './schemas/folder-config';
export type { FolderConfig, FolderEndpoint, FrontmatterField } from './schemas/folder-config';
export { defaultFolderConfig } from './config/folders';
```

### Step 4: Create directories

```bash
mkdir -p code/src/mastra/schemas
mkdir -p code/src/mastra/config
```

## Patterns to Follow

- Use Zod v4 syntax (already in package.json: `"zod": "^4.3.5"`)
- Follow existing tool schema pattern from `code/src/mastra/tools/weather-tool.ts:26-37`
- Export types using `z.infer<typeof schema>` pattern
- Keep schemas in dedicated `schemas/` directory

## Verification

```bash
cd code
npm run build  # Should compile without errors
```

## Dependencies

None - this is a foundational task.

## Related

- [architecture/overview.md](../architecture/overview.md)
- [domains/endpoints/README.md](../domains/endpoints/README.md)
