# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context Network

Start with [.context-network.md](.context-network.md) to navigate project knowledge:
- **Current state:** [context/status.md](context/status.md)
- **Decisions:** [context/decisions.md](context/decisions.md)
- **Terminology:** [context/glossary.md](context/glossary.md)
- **Architecture:** [context/architecture/overview.md](context/architecture/overview.md)

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

## Build Commands

```bash
cd code
npm run dev      # Start Mastra dev server (localhost:4111)
npm run build    # Build for production
npm run start    # Start production server
```

## Skills

The `.claude/skills/` directory contains specialized skills that **should be preferred over generic approaches**. Skills encode domain expertise, tested patterns, and project-specific guidance that built-in tools lack.

### Skill Priority Rules

1. **Check for applicable skill first** before writing code or making decisions
2. **Use skill patterns** even if not explicitly invoking the skill
3. **Diagnostic skills guide process**—follow their frameworks for requirements, design, and research
4. **User-invocable skills** can be triggered with `/skill-name`

### Project-Critical Skills

These skills are essential for this project's tech stack:

| Skill | Use When | Invocation |
|-------|----------|------------|
| `mastra-hono` | Creating agents, tools, workflows, or Hono API endpoints | `/mastra-hono` |
| `typescript-best-practices` | Writing or reviewing any TypeScript code | `/typescript-best-practices` |
| `mastra-testing-patterns` | Testing agents, tools, or workflows (handles non-determinism) | Contextual |

**Always use `mastra-hono` patterns** when creating Mastra components—it has correct v1 Beta APIs, Zod schema patterns, workflow data flow, and common mistakes to avoid.

### Development Workflow Skills

| Skill | Use When | Invocation |
|-------|----------|------------|
| `agile-coordinator` | Multiple ready tasks, batch execution, autonomous multi-task work | `/agile-coordinator` |
| `agile-workflow` | "run workflow", "continue working", "what's next", sprint management | `/agile-workflow` |
| `github-agile` | GitHub workflow issues, branch strategy, PR templates, issue management | Contextual |
| `code-review` | Reviewing code for quality, security, maintainability | Contextual |

### Requirements & Design Skills

Use these **before writing code** to ensure you're solving the right problem:

| Skill | Use When |
|-------|----------|
| `requirements-analysis` | Starting work, distinguishing stated wants from underlying problems |
| `requirements-elaboration` | High-level asks with implicit decisions, challenging defaults |
| `system-design` | Translating requirements to architecture, technology choices |

### Research & Context Skills

| Skill | Use When |
|-------|----------|
| `research` | Starting research, stuck in research, validating assumptions |
| `context-network` | Documentation scattered, agent effectiveness degrading, starting new project |
| `context-retrospective` | After significant interactions, improving guidance, finding context gaps |

### Infrastructure Skills

| Skill | Use When |
|-------|----------|
| `devcontainer` | Container build failures, "command not found", permission issues |
| `agent-hooks` | Building lifecycle hooks for Claude Code/OpenCode |
| `skill-builder` | Creating new skills following established patterns |

### Specialized Domain Skills

| Skill | Domain | Use When |
|-------|--------|----------|
| `playwright-skill` | Testing | Browser automation, UI testing, screenshots |
| `vector-retrieval-patterns` | AI/Memory | RAG, semantic search, memory retrieval |
| `storage-adapter-patterns` | Data | Multi-backend storage abstraction |
| `vercel-react-best-practices` | Frontend | React/Next.js optimization |
| `brainstorming` | Ideation | Escaping convergent thinking, exploring possibilities |
| `competency` | Training | Building competency frameworks |

### When to Use Skills vs Built-in Tools

| Situation | Use Skill | Not Built-in Because |
|-----------|-----------|---------------------|
| Create Mastra agent | `mastra-hono` | Has correct v1 Beta patterns, avoids common mistakes |
| Write TypeScript | `typescript-best-practices` | Project-specific conventions, type patterns |
| Test AI components | `mastra-testing-patterns` | Handles non-determinism, semantic assertions |
| Unclear requirements | `requirements-analysis` | Structured discovery process |
| Architecture decision | `system-design` | Trade-off framework, ADR templates |
| Devcontainer broken | `devcontainer` | Knows installer quirks, multi-user patterns |
| Browser testing | `playwright-skill` | Auto-detects servers, writes clean scripts |

### Skill Invocation

**Direct invocation** (user-invocable skills):
```
/agile-coordinator
/agile-workflow
/mastra-hono
/typescript-best-practices
/playwright-skill
```

**Contextual invocation** (diagnostic skills): The agent should recognize trigger conditions and apply skill guidance automatically when working on relevant tasks.
