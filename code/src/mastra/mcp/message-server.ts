import { MCPServer } from '@mastra/mcp';
import { conciergeAgent } from '../agents/concierge-agent';
import { messageWorkflow } from '../workflows/message-workflow';
import {
  listEndpointsTool,
  listMessagesTool,
  readMessageTool,
  submitMessageTool,
  writeResponseTool,
} from '../tools/message-tools';
import {
  getMessageStatusTool,
  listMessageStatusesTool,
} from '../tools/status-tools';

export const messageMcpServer = new MCPServer({
  id: 'message-mcp',
  name: 'Message MCP Server',
  version: '1.0.0',
  description: 'Exposes message processing agent and tools via MCP for any configured folder endpoint',

  // Direct tool exposure
  tools: {
    listEndpointsTool,
    listMessagesTool,
    readMessageTool,
    submitMessageTool,
    writeResponseTool,
    getMessageStatusTool,
    listMessageStatusesTool,
  },

  // Agent becomes ask_conciergeAgent tool
  agents: { conciergeAgent },

  // Workflow becomes run_messageWorkflow tool
  workflows: { messageWorkflow },
});

// Legacy export for backwards compatibility
export const inboxMcpServer = messageMcpServer;
