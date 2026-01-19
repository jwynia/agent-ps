# Architecture Overview

## System Purpose

Agent-ps is a "postal service" for AI agents—a web API that enables asynchronous, file-based communication between agents across different projects and environments.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DevContainer                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   agent-ps API                           ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   ││
│  │  │ Folder Watch │  │  A2A Router  │  │ MCP Server   │   ││
│  │  │   Service    │  │              │  │              │   ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   ││
│  │         │                 │                 │            ││
│  │  ┌──────▼─────────────────▼─────────────────▼──────┐    ││
│  │  │              Mastra/Hono Server                  │    ││
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │    ││
│  │  │  │ Concierge│  │  Inbox  │  │ Workflow │          │    ││
│  │  │  │  Agent  │  │ Processor│  │ Executor │          │    ││
│  │  │  └─────────┘  └─────────┘  └─────────┘          │    ││
│  │  └─────────────────────────────────────────────────┘    ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────────┐│
│  │                  Folder Endpoints                        ││
│  │  /inbox    /outbox    /bugs    /feature-requests  ...   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   External Agents      Local Project
   (via A2A/HTTP)       (Claude Code, etc.)
```

## Components

### Folder Watch Service
Monitors configured directories for new Markdown files. Triggers processing when messages arrive.

### A2A Router
Handles agent-to-agent protocol communication. Routes incoming A2A requests to appropriate Mastra agents.

### MCP Server
Exposes tools and workflows to external agents/models via Model Context Protocol.

### Mastra/Hono Server
Core application server handling HTTP requests, agent orchestration, and workflow execution.

### Concierge Agent
Primary interface agent for external communication. Provides project status, handles requests, routes messages.

### Inbox Processor
Parses incoming Markdown messages, extracts YAML frontmatter, dispatches to appropriate handlers.

### Workflow Executor
Runs multi-step workflows triggered by messages or A2A requests.

## Data Flow

1. **Incoming Message (File)**
   - File dropped in `/inbox`
   - Folder Watch detects new file
   - Inbox Processor parses frontmatter + body
   - Routed to handler based on frontmatter type
   - Response written to `/outbox` if requested

2. **Incoming Request (A2A)**
   - A2A request arrives at API
   - Routed to Concierge Agent
   - Agent processes request, may invoke tools/workflows
   - Response returned via A2A protocol

3. **Tool Invocation (MCP)**
   - External agent discovers tools via MCP
   - Invokes tool with parameters
   - Tool executes, returns result via MCP

## Related

- [Decisions](../decisions.md) - Architecture decisions
- [Glossary](../glossary.md) - Term definitions
- [Agents Domain](../domains/agents/) - Agent implementation details
- [Endpoints Domain](../domains/endpoints/) - Folder endpoint configuration
