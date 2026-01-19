import chokidar, { type FSWatcher } from 'chokidar';
import matter from 'gray-matter';
import { readFile, stat, access } from 'fs/promises';
import { join, relative } from 'path';
import { EventEmitter } from 'events';
import type { FolderConfig, FolderEndpoint } from '../schemas/folder-config';
import type { Message, FolderEvent } from '../schemas/message';

/**
 * Detect if running in a container environment where fsevents won't work
 */
function isContainerEnvironment(): boolean {
  // Check common container indicators
  if (process.env.CONTAINER === 'true') return true;
  if (process.env.DOCKER_CONTAINER === 'true') return true;
  if (process.env.REMOTE_CONTAINERS === 'true') return true;

  // Running in VS Code devcontainer
  if (process.env.REMOTE_CONTAINERS_IPC) return true;

  // Check for /.dockerenv file (sync check is fine at startup)
  try {
    require('fs').accessSync('/.dockerenv');
    return true;
  } catch {
    // Not in Docker
  }

  // Default: not a container
  return false;
}

export class FolderWatcher extends EventEmitter {
  private config: FolderConfig;
  private watchers: Map<string, FSWatcher> = new Map();
  private isRunning = false;
  private forcePolling: boolean;

  constructor(config: FolderConfig) {
    super();
    this.config = config;
    this.forcePolling = isContainerEnvironment();
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

    // Use polling if configured, or if in a container environment
    const shouldPoll = endpoint.watchMode === 'poll' || this.forcePolling;
    const pollInterval = endpoint.pollIntervalMs ?? 1000;

    // Watch the directory directly (glob patterns don't work reliably with polling)
    const watcher = chokidar.watch(fullPath, {
      persistent: true,
      ignoreInitial: true,  // Don't process existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      usePolling: shouldPoll,
      interval: pollInterval,
      depth: 1,  // Watch immediate children only (no deep nesting)
    });

    // Filter for markdown files in event handlers
    const isMarkdownFile = (path: string) => path.endsWith('.md');

    watcher
      .on('add', (path) => {
        if (isMarkdownFile(path)) {
          this.handleFile('created', path, endpoint);
        }
      })
      .on('change', (path) => {
        if (isMarkdownFile(path)) {
          this.handleFile('updated', path, endpoint);
        }
      })
      .on('unlink', (path) => {
        if (isMarkdownFile(path)) {
          this.handleDelete(path, endpoint);
        }
      })
      .on('error', (error) => this.emit('error', error))
      .on('ready', () => {
        console.log(`Watching ${endpoint.id} at ${fullPath} (polling: ${shouldPoll})`);
      });

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
      ...(this.config.defaultFrontmatter?.filter((f) => f.required) ?? []),
      ...(endpoint.requiredFrontmatter?.filter((f) => f.required) ?? []),
    ];

    for (const field of allRequired) {
      if (!(field.name in frontmatter)) {
        throw new Error(`Missing required frontmatter field: ${field.name}`);
      }
    }

    return {
      id: (frontmatter.id as string) || relative(this.config.rootPath, filePath),
      filePath,
      endpointId: endpoint.id,
      frontmatter,
      content: content.trim(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  }
}
