
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { conciergeAgent } from './agents/concierge-agent';
import { messageWorkflow } from './workflows/message-workflow';
import { messageMcpServer } from './mcp/message-server';
import { MessageProcessor } from './services/message-processor';
import { defaultFolderConfig } from './config/folders';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, messageWorkflow },
  agents: { weatherAgent, conciergeAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  mcpServers: { message: messageMcpServer },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});

// Auto-start message processor when this module loads
const messageProcessor = new MessageProcessor(defaultFolderConfig, mastra);

// Start the processor (non-blocking)
messageProcessor.start().catch((error) => {
  console.error('Failed to start message processor:', error);
});

// Folder configuration exports
export {
  folderConfigSchema,
  folderEndpointSchema,
  frontmatterFieldSchema,
} from './schemas/folder-config';
export type {
  FolderConfig,
  FolderEndpoint,
  FrontmatterField,
} from './schemas/folder-config';
export {
  defaultFolderConfig,
  getEndpoint,
  getEndpointPath,
  listEndpoints,
  getInboxEndpoints,
  getDefaultOutboxEndpoint,
} from './config/folders';

// Message router exports
export { MessageRouter, defaultRouterConfig } from './config/message-router';
export type { MessageRoute, RouterConfig } from './config/message-router';

// Message schema exports
export { messageSchema, folderEventSchema } from './schemas/message';
export type { Message, FolderEvent } from './schemas/message';

// Message status exports
export {
  messageStatusSchema,
  messageStatusValue,
  updateMessageStatus,
  getMessageStatus,
  getAllMessageStatuses,
  clearStatusStore,
} from './schemas/message-status';
export type { MessageStatus, MessageStatusValue } from './schemas/message-status';

// Service exports
export { FolderWatcher } from './services/folder-watcher';
export { MessageWriter } from './services/message-writer';
export type { WriteMessageOptions } from './services/message-writer';
export { MessageProcessor, InboxProcessor } from './services/message-processor';

// Message tools exports
export {
  listEndpointsTool,
  listMessagesTool,
  readMessageTool,
  submitMessageTool,
  writeResponseTool,
  listInboxTool,
} from './tools/message-tools';

// Status tools exports
export {
  getMessageStatusTool,
  listMessageStatusesTool,
} from './tools/status-tools';

// Agent exports
export { conciergeAgent, inboxAgent } from './agents/concierge-agent';

// Workflow exports
export { messageWorkflow, inboxWorkflow } from './workflows/message-workflow';

// MCP Server exports
export { messageMcpServer, inboxMcpServer } from './mcp/message-server';
