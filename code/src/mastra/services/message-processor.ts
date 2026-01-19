import { FolderWatcher } from './folder-watcher';
import type { FolderConfig } from '../schemas/folder-config';
import type { FolderEvent, Message } from '../schemas/message';
import type { Mastra } from '@mastra/core/mastra';
import { getInboxEndpoints } from '../config/folders';
import { basename } from 'path';
import { updateMessageStatus, type MessageStatus } from '../schemas/message-status';
import { MessageRouter, type RouterConfig, defaultRouterConfig } from '../config/message-router';

export class MessageProcessor {
  private watcher: FolderWatcher;
  private mastra: Mastra;
  private config: FolderConfig;
  private router: MessageRouter;

  constructor(config: FolderConfig, mastra: Mastra, routerConfig?: RouterConfig) {
    this.mastra = mastra;
    this.config = config;
    this.router = new MessageRouter(mastra, routerConfig ?? defaultRouterConfig);

    // Filter config to only watch inbox-direction endpoints
    const inboxEndpoints = getInboxEndpoints(config);
    const watchConfig: FolderConfig = {
      ...config,
      endpoints: inboxEndpoints,
    };

    this.watcher = new FolderWatcher(watchConfig);
    this.watcher.on('message', this.handleEvent.bind(this));
    this.watcher.on('error', this.handleError.bind(this));
  }

  async start(): Promise<void> {
    const endpoints = getInboxEndpoints(this.config);
    const endpointIds = endpoints.map(e => e.id).join(', ');
    await this.watcher.start();
    console.log(`Message processor started, watching endpoints: ${endpointIds}`);
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
    console.log('Message processor stopped');
  }

  private async handleEvent(event: FolderEvent): Promise<void> {
    if (event.type === 'message:created') {
      console.log(`New message: ${event.message.filePath} (endpoint: ${event.message.endpointId})`);
      await this.processMessage(event.message);
    } else if (event.type === 'message:updated') {
      console.log(`Updated message: ${event.message.filePath} (endpoint: ${event.message.endpointId})`);
    } else if (event.type === 'message:deleted') {
      console.log(`Deleted message: ${event.filePath} (endpoint: ${event.endpointId})`);
    } else if (event.type === 'error') {
      console.error(`Error processing ${event.filePath}: ${event.error}`);
    }
  }

  private handleError(error: Error): void {
    console.error('Folder watcher error:', error);
  }

  private async processMessage(message: Message): Promise<void> {
    const filename = basename(message.filePath);
    const messageId = message.id;
    const endpointId = message.endpointId;
    const messageType = message.frontmatter?.type as string | undefined;

    // Initial status: pending
    const status: MessageStatus = {
      id: messageId,
      status: 'pending',
      endpoint: endpointId,
      filename,
      createdAt: new Date().toISOString(),
    };
    updateMessageStatus(status);

    try {
      if (!filename) {
        throw new Error('Could not extract filename from path');
      }

      // Update status to processing
      status.status = 'processing';
      updateMessageStatus(status);

      // Use router to dispatch to appropriate handler
      const { handler, result } = await this.router.routeMessage(
        filename,
        endpointId,
        messageType
      );

      console.log(`Message ${filename} processed by ${handler}`);

      // Update status to completed
      status.status = 'completed';
      status.processedAt = new Date().toISOString();
      status.summary = result;
      updateMessageStatus(status);

    } catch (error) {
      console.error(`Error processing message ${message.filePath}:`, error);

      // Update status to failed
      status.status = 'failed';
      status.processedAt = new Date().toISOString();
      status.error = error instanceof Error ? error.message : String(error);
      updateMessageStatus(status);
    }
  }
}

// Legacy export for backwards compatibility
export const InboxProcessor = MessageProcessor;
