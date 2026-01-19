# TASK-002: Implement Folder-Watching Service

## Status: ready
## Priority: high
## Size: large
## Created: 2026-01-19

## Description

Create a service that watches configured folders for new/changed Markdown files and triggers processing workflows. This is the core mechanism for the inbox/outbox pattern.

## Acceptance Criteria

- [ ] Watch configured directories for file changes
- [ ] Parse Markdown files with YAML frontmatter
- [ ] Emit events when new messages arrive
- [ ] Handle file creation, modification, deletion
- [ ] Graceful error handling for malformed files

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- **TASK-001** ~~must be completed~~ **COMPLETED** (provides `FolderConfig` schema and types)

## Implementation Plan

### Step 1: Install dependencies

```bash
cd code
npm install chokidar gray-matter
npm install -D @types/chokidar
```

- `chokidar` - Cross-platform file watching
- `gray-matter` - YAML frontmatter parsing

### Step 2: Create message types

**File:** `code/src/mastra/schemas/message.ts`

```typescript
import { z } from 'zod';

// Schema for parsed message from a Markdown file
export const messageSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  endpointId: z.string(),
  frontmatter: z.record(z.unknown()),
  content: z.string(),
  createdAt: z.date(),
  modifiedAt: z.date(),
});

export type Message = z.infer<typeof messageSchema>;

// Event types emitted by the folder watcher
export const folderEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message:created'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message:updated'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message:deleted'),
    filePath: z.string(),
    endpointId: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    filePath: z.string(),
    error: z.string(),
  }),
]);

export type FolderEvent = z.infer<typeof folderEventSchema>;
```

### Step 3: Create folder watcher service

**File:** `code/src/mastra/services/folder-watcher.ts`

```typescript
import chokidar, { FSWatcher } from 'chokidar';
import matter from 'gray-matter';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { EventEmitter } from 'events';
import { FolderConfig, FolderEndpoint } from '../schemas/folder-config';
import { Message, FolderEvent } from '../schemas/message';

export class FolderWatcher extends EventEmitter {
  private config: FolderConfig;
  private watchers: Map<string, FSWatcher> = new Map();
  private isRunning = false;

  constructor(config: FolderConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const endpoint of this.config.endpoints) {
      if (endpoint.direction === 'outbox') continue; // Don't watch outbox
      await this.watchEndpoint(endpoint);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const [id, watcher] of this.watchers) {
      await watcher.close();
      this.watchers.delete(id);
    }
  }

  private async watchEndpoint(endpoint: FolderEndpoint): Promise<void> {
    const fullPath = join(this.config.rootPath, endpoint.path);
    const pattern = join(fullPath, endpoint.pattern);

    const watcher = chokidar.watch(pattern, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      usePolling: endpoint.watchMode === 'poll',
      interval: endpoint.pollIntervalMs,
    });

    watcher
      .on('add', (path) => this.handleFile('created', path, endpoint))
      .on('change', (path) => this.handleFile('updated', path, endpoint))
      .on('unlink', (path) => this.handleDelete(path, endpoint))
      .on('error', (error) => this.emit('error', error));

    this.watchers.set(endpoint.id, watcher);
  }

  private async handleFile(
    action: 'created' | 'updated',
    filePath: string,
    endpoint: FolderEndpoint
  ): Promise<void> {
    try {
      const message = await this.parseFile(filePath, endpoint);
      const event: FolderEvent = {
        type: action === 'created' ? 'message:created' : 'message:updated',
        message,
      };
      this.emit('message', event);
    } catch (error) {
      const event: FolderEvent = {
        type: 'error',
        filePath,
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit('message', event);
    }
  }

  private handleDelete(filePath: string, endpoint: FolderEndpoint): void {
    const event: FolderEvent = {
      type: 'message:deleted',
      filePath,
      endpointId: endpoint.id,
    };
    this.emit('message', event);
  }

  private async parseFile(filePath: string, endpoint: FolderEndpoint): Promise<Message> {
    const fileContent = await readFile(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);
    const stats = await stat(filePath);

    // Validate required frontmatter
    const allRequired = [
      ...this.config.defaultFrontmatter.filter((f) => f.required),
      ...endpoint.requiredFrontmatter.filter((f) => f.required),
    ];

    for (const field of allRequired) {
      if (!(field.name in frontmatter)) {
        throw new Error(`Missing required frontmatter field: ${field.name}`);
      }
    }

    return {
      id: frontmatter.id || relative(this.config.rootPath, filePath),
      filePath,
      endpointId: endpoint.id,
      frontmatter,
      content: content.trim(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  }
}
```

### Step 4: Create message writer utility

**File:** `code/src/mastra/services/message-writer.ts`

```typescript
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { FolderConfig, FolderEndpoint } from '../schemas/folder-config';
import { randomUUID } from 'crypto';

export interface WriteMessageOptions {
  endpointId: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  filename?: string;
}

export class MessageWriter {
  constructor(private config: FolderConfig) {}

  async write(options: WriteMessageOptions): Promise<string> {
    const endpoint = this.config.endpoints.find((e) => e.id === options.endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${options.endpointId}`);
    }

    const id = randomUUID();
    const filename = options.filename || `${id}.md`;
    const filePath = join(this.config.rootPath, endpoint.path, filename);

    // Build frontmatter with defaults
    const frontmatter: Record<string, unknown> = {
      id,
      timestamp: new Date().toISOString(),
      ...options.frontmatter,
    };

    // Format as YAML frontmatter + content
    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${options.content}`;

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, fileContent, 'utf-8');

    return filePath;
  }
}
```

### Step 5: Update barrel exports

**File:** `code/src/mastra/index.ts` - Add:

```typescript
export { messageSchema, folderEventSchema } from './schemas/message';
export type { Message, FolderEvent } from './schemas/message';
export { FolderWatcher } from './services/folder-watcher';
export { MessageWriter } from './services/message-writer';
```

### Step 6: Create directories and message folders

```bash
mkdir -p code/src/mastra/services
mkdir -p .agents/messages/inbox
mkdir -p .agents/messages/outbox
```

## Patterns to Follow

- Use EventEmitter for async event handling (Node.js standard)
- Follow Mastra service patterns
- Use Zod for runtime validation of parsed messages
- Handle errors gracefully, emit error events rather than throwing

## Verification

```bash
cd code
npm run build  # Should compile without errors
```

Manual test:
1. Start the watcher in a test script
2. Create a .md file in `.agents/messages/inbox/`
3. Verify `message:created` event is emitted

## Related

- [domains/endpoints/README.md](../domains/endpoints/README.md)
- TASK-001 (folder configuration schema)
