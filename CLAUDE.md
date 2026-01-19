# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent-ps is a web API that enables inbox/outbox communication between AI agents. It runs inside a devcontainer and exposes folders for agents to exchange Markdown files with YAML headers. The API uses Mastra/Hono, enabling agent exposure via A2A protocol and tools/workflows via MCP.

## Development Environment

The project uses a devcontainer with:
- Node.js 24 (primary runtime)
- Bun
- Deno
- Claude Code CLI

Environment variables point to `.agents/` for XDG directories and `.claude/` for Claude config.

To start the devcontainer:
```bash
# In VS Code: Reopen in Container
# Or via CLI: devcontainer up --workspace-folder .
```

## Architecture (Planned)

- **Web API**: Mastra/Hono server exposing folder endpoints for agent communication
- **Folder Endpoints**: Configurable folders (inbox, outbox, /bugs, /feature-requests, etc.)
- **Message Format**: Markdown files with YAML frontmatter for response correspondence
- **Agent Exposure**: A2A protocol for agent-to-agent communication
- **Tool Exposure**: MCP protocol for workflows and tools

## Skills Available

The `.claude/skills/` directory contains specialized skills for common tasks:
- `mastra-hono`: Mastra agent/workflow development patterns
- `typescript-best-practices`: TypeScript coding standards
- `github-agile`: GitHub-driven agile workflow
- `agile-workflow`: Task cycle and sprint management
