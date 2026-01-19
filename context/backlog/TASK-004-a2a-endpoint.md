# TASK-004: Configure A2A and MCP Protocol Exposure

## Status: completed
## Priority: medium
## Size: small
## Created: 2026-01-19
## Re-groomed: 2026-01-19
## Completed: 2026-01-19

## Description

Configure Mastra to expose the inbox agent via A2A protocol and tools/workflows via MCP. Mastra handles protocol implementation internally - this task is configuration only.

## Acceptance Criteria

- [x] Verify A2A endpoints work via `mastra dev` server
- [x] Create MCPServer configuration for inbox tools
- [x] Register MCPServer with Mastra config
- [x] Document endpoint URLs and usage

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- **TASK-003** ~~must be completed~~ **COMPLETED** (provides inbox agent and workflow)

## Implementation Plan

### Background: What Mastra Already Provides

**A2A Protocol** (built into `mastra dev`):
- Agent card endpoint: Automatically served
- Message handling: Built-in via `@mastra/deployer`
- Task management: Async task handling included
- No custom routes needed

**MCP Protocol** (via `@mastra/mcp`):
- `MCPServer` class wraps agents/workflows/tools
- Agents become tools named `ask_<agentName>`
- Workflows become tools named `run_<workflowKey>`
- Supports stdio, SSE, HTTP transports

### Step 1: Verify A2A works out of the box

```bash
cd code
npm run dev

# Test that inbox agent is accessible via Mastra's built-in A2A
# Check Mastra Studio at http://localhost:4111 for agent endpoints
```

### Step 2: Create MCP Server configuration

**File:** `code/src/mastra/mcp/inbox-server.ts`

```typescript
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
```

### Step 3: Register MCPServer with Mastra

**File:** `code/src/mastra/index.ts` - Add:

```typescript
import { inboxMcpServer } from './mcp/inbox-server';

export const mastra = new Mastra({
  // ... existing config

  // Add MCP server registration
  mcpServers: {
    inbox: inboxMcpServer,
  },
});
```

### Step 4: Create MCP directory

```bash
mkdir -p code/src/mastra/mcp
```

### Step 5: Update exports

**File:** `code/src/mastra/index.ts` - Add export:

```typescript
export { inboxMcpServer } from './mcp/inbox-server';
```

## Verification

```bash
cd code
npm run dev

# Mastra Studio should show:
# - Agents: weatherAgent, inboxAgent
# - Workflows: weatherWorkflow, inboxWorkflow
# - MCP Servers: inbox

# MCP tools available:
# - list-inbox, read-message, write-response (direct tools)
# - ask_inboxAgent (agent as tool)
# - run_inboxWorkflow (workflow as tool)
```

## Patterns to Follow

- Use `@mastra/mcp` MCPServer class (not custom Hono routes)
- Let Mastra handle A2A protocol (built-in)
- Configure, don't implement

## What Was Removed

The original TASK-004 included custom implementation that duplicates Mastra's built-in functionality:
- ~~Custom Hono server~~ (Mastra provides this)
- ~~Custom A2A routes~~ (Mastra handles A2A)
- ~~Manual agent card endpoint~~ (Mastra serves this)
- ~~Custom task tracking~~ (Mastra manages tasks)

## Related

- [domains/protocols/README.md](../domains/protocols/README.md)
- [glossary.md](../glossary.md) - A2A/MCP definitions
- TASK-003 (inbox processing agent)
