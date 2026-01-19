
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { inboxAgent } from './agents/inbox-agent';
import { inboxWorkflow } from './workflows/inbox-workflow';
import { inboxMcpServer } from './mcp/inbox-server';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, inboxWorkflow },
  agents: { weatherAgent, inboxAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  mcpServers: { inbox: inboxMcpServer },
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
export { defaultFolderConfig } from './config/folders';

// Message schema exports
export { messageSchema, folderEventSchema } from './schemas/message';
export type { Message, FolderEvent } from './schemas/message';

// Service exports
export { FolderWatcher } from './services/folder-watcher';
export { MessageWriter } from './services/message-writer';
export type { WriteMessageOptions } from './services/message-writer';
export { InboxProcessor } from './services/inbox-processor';

// Inbox tools exports
export { listInboxTool, readMessageTool, writeResponseTool } from './tools/inbox-tools';

// MCP Server exports
export { inboxMcpServer } from './mcp/inbox-server';
