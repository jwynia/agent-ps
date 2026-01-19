import { MCPServer } from '@mastra/mcp';
import { inboxAgent } from '../agents/inbox-agent';
import { inboxWorkflow } from '../workflows/inbox-workflow';
import { listInboxTool, readMessageTool, writeResponseTool } from '../tools/inbox-tools';

export const inboxMcpServer = new MCPServer({
  id: 'inbox-mcp',
  name: 'Inbox MCP Server',
  version: '1.0.0',
  description: 'Exposes inbox processing agent and tools via MCP',

  // Direct tool exposure
  tools: { listInboxTool, readMessageTool, writeResponseTool },

  // Agent becomes ask_inboxAgent tool
  agents: { inboxAgent },

  // Workflow becomes run_inboxWorkflow tool
  workflows: { inboxWorkflow },
});
