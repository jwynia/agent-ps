# Glossary

## Protocols

**A2A (Agent-to-Agent)**
Protocol for direct communication between AI agents. Mastra provides built-in support for exposing agents via A2A endpoints.

**MCP (Model Context Protocol)**
Protocol for exposing tools and workflows to AI models. Enables external agents to invoke this project's capabilities.

## Architecture Terms

**Folder Endpoint**
A configured directory (inbox, outbox, /bugs, etc.) exposed via the API for file-based agent communication.

**Inbox/Outbox**
Primary communication folders. Inbox receives incoming messages; outbox holds responses.

**YAML Frontmatter**
Metadata header in Markdown files specifying routing, priority, and response correspondence information.

## Mastra Terms

**Mastra Agent**
An AI agent defined using Mastra's agent API. Has instructions, tools, and can participate in workflows.

**Mastra Tool**
A function exposed to agents with defined input/output schemas (Zod). Can be invoked by agents or via MCP.

**Mastra Workflow**
A multi-step process with defined data flow between steps. Can include agent invocations and tool calls.

**Mastra Studio**
Interactive UI at localhost:4111 for testing agents, tools, and workflows during development.

## Project-Specific

**Concierge Agent**
An agent that provides status reports, project information, and handles incoming requests from external agents.

**Message**
A Markdown file with YAML frontmatter dropped into a folder endpoint for processing.
