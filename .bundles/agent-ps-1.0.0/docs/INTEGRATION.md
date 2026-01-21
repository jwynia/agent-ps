# Agent-PS Integration Guide

## Overview

Agent-PS is a web API that enables inbox/outbox communication between AI agents.
This bundle contains everything needed to run Agent-PS in your project's devcontainer.

## Bundle Contents

```
.agent-ps/
├── runtime/           # Application code
│   ├── index.mjs      # Main entry point
│   ├── mastra.mjs     # Mastra configuration
│   ├── tools.mjs      # Tool exports
│   ├── tools/         # Tool implementations
│   └── package.json   # Dependencies
├── templates/         # Configuration templates
│   ├── devcontainer-fragment.json
│   └── env.example
├── scripts/           # Helper scripts
│   ├── start.sh       # Start the server
│   ├── install.sh     # Install to target project
│   └── healthcheck.sh # Verify server health
├── messages/          # Message directories
│   ├── inbox/
│   ├── outbox/
│   ├── bugs/
│   └── feature-requests/
├── docs/
│   └── INTEGRATION.md # This file
├── bundle.json        # Bundle metadata
└── README.md          # Quick start guide
```

## Installation

### Option 1: Manual Copy

```bash
# From the bundle directory
cp -r . /path/to/your-project/.agent-ps
```

### Option 2: Install Script

```bash
./scripts/install.sh /path/to/your-project
```

## Configuration

### 1. Environment Variables

Create or edit `.devcontainer/.env`:

```bash
# Required
ANTHROPIC_API_KEY=your-api-key-here

# Optional
AGENT_PS_PORT=4111
MESSAGES_ROOT=/custom/path/to/messages
LOG_LEVEL=info
```

### 2. Devcontainer Configuration

Merge the following into your `.devcontainer/devcontainer.json`:

```json
{
  "containerEnv": {
    "AGENT_PS_ROOT": "/workspaces/${localWorkspaceFolderBasename}/.agent-ps/runtime",
    "MESSAGES_ROOT": "/workspaces/${localWorkspaceFolderBasename}/.agent-ps/messages"
  },
  "forwardPorts": [4111],
  "postStartCommand": "bash ${containerWorkspaceFolder}/.agent-ps/scripts/start.sh &"
}
```

### 3. Rebuild Container

After configuration, rebuild your devcontainer to apply changes.

## Usage

### Starting the Server

The server starts automatically via `postStartCommand`.
To start manually:

```bash
./.agent-ps/scripts/start.sh
```

### Health Check

```bash
./.agent-ps/scripts/healthcheck.sh
```

Or via curl:

```bash
curl http://localhost:4111/
```

### API Endpoints

The server exposes endpoints for agent communication:

- `GET /` - Server info
- `GET /api` - API info
- Message folder endpoints (configured via MESSAGES_ROOT)

## Message Format

Messages are Markdown files with YAML frontmatter:

```markdown
---
id: msg-001
from: agent-a
to: agent-b
subject: Task Request
timestamp: 2024-01-15T10:30:00Z
status: pending
---

# Task Request

Please process this request...
```

## Troubleshooting

### Server Won't Start

1. Check Node.js version: `node -v` (requires 22+)
2. Verify dependencies: `cd runtime && npm install`
3. Check logs for errors

### Port Already in Use

Change the port in your environment:

```bash
AGENT_PS_PORT=4112
```

### Missing API Key

Ensure `ANTHROPIC_API_KEY` is set in `.devcontainer/.env`

## Requirements

- Node.js 22.13.0 or later
- npm (for dependency installation)
