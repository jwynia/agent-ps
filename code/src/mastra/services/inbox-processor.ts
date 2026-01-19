import { FolderWatcher } from './folder-watcher';
import type { FolderConfig } from '../schemas/folder-config';
import type { FolderEvent } from '../schemas/message';
import type { Mastra } from '@mastra/core/mastra';

export class InboxProcessor {
  private watcher: FolderWatcher;
  private mastra: Mastra;

  constructor(config: FolderConfig, mastra: Mastra) {
    this.mastra = mastra;
    this.watcher = new FolderWatcher(config);
    this.watcher.on('message', this.handleEvent.bind(this));
    this.watcher.on('error', this.handleError.bind(this));
  }

  async start(): Promise<void> {
    await this.watcher.start();
    console.log('Inbox processor started');
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
    console.log('Inbox processor stopped');
  }

  private async handleEvent(event: FolderEvent): Promise<void> {
    if (event.type === 'message:created') {
      console.log(`New message: ${event.message.filePath}`);
      await this.processMessage(event.message.filePath);
    } else if (event.type === 'message:updated') {
      console.log(`Updated message: ${event.message.filePath}`);
    } else if (event.type === 'message:deleted') {
      console.log(`Deleted message: ${event.filePath}`);
    } else if (event.type === 'error') {
      console.error(`Error processing ${event.filePath}: ${event.error}`);
    }
  }

  private handleError(error: Error): void {
    console.error('Folder watcher error:', error);
  }

  private async processMessage(filePath: string): Promise<void> {
    try {
      const filename = filePath.split('/').pop();
      if (!filename) {
        throw new Error('Could not extract filename from path');
      }

      const workflow = this.mastra.getWorkflow('inboxWorkflow');
      if (workflow) {
        const run = workflow.createRun();
        const result = await run.start({
          triggerData: { filename },
        });
        console.log('Workflow result:', result);
      } else {
        // Fallback to direct agent invocation
        const agent = this.mastra.getAgent('inboxAgent');
        if (agent) {
          const response = await agent.generate([
            {
              role: 'user',
              content: `Process the inbox message with filename: ${filename}. Read it and respond appropriately.`,
            },
          ]);
          console.log('Agent response:', response.text);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }
}
