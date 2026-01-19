import chokidar, { type FSWatcher } from 'chokidar';
import matter from 'gray-matter';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { EventEmitter } from 'events';
import type { FolderConfig, FolderEndpoint } from '../schemas/folder-config';
import type { Message, FolderEvent } from '../schemas/message';

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
