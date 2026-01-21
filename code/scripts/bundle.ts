#!/usr/bin/env tsx
/**
 * Agent-PS Bundle Script
 *
 * Creates a distributable bundle from the Mastra build output.
 * The bundle can be dropped into another project and configured
 * to run in that project's devcontainer.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PROJECT_ROOT, "..");

interface BundleConfig {
  outputDir: string;
  mastraOutput: string;
  templatesDir: string;
  includeNodeModules: boolean;
  version: string;
}

interface BundleMetadata {
  name: string;
  version: string;
  createdAt: string;
  variant: "minimal" | "full";
  nodeVersion: string;
  files: string[];
}

function log(message: string): void {
  console.log(`[bundle] ${message}`);
}

function error(message: string): void {
  console.error(`[bundle] ERROR: ${message}`);
}

function getVersion(): string {
  const packagePath = join(PROJECT_ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
  return pkg.version || "0.0.0";
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyDirectory(
  src: string,
  dest: string,
  options: { exclude?: string[] } = {}
): void {
  const { exclude = [] } = options;

  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const relativePath = source.replace(src, "");
      return !exclude.some((pattern) => relativePath.includes(pattern));
    },
  });
}

function generateBundleJson(config: BundleConfig): BundleMetadata {
  return {
    name: "agent-ps",
    version: config.version,
    createdAt: new Date().toISOString(),
    variant: config.includeNodeModules ? "full" : "minimal",
    nodeVersion: ">=22.13.0",
    files: [
      "runtime/",
      "templates/",
      "scripts/",
      "docs/",
      "bundle.json",
      "README.md",
    ],
  };
}

function generateReadme(config: BundleConfig): string {
  return `# Agent-PS Bundle

Version: ${config.version}
Variant: ${config.includeNodeModules ? "Full (includes node_modules)" : "Minimal (requires npm install)"}

## Quick Start

1. Copy this bundle to your project:
   \`\`\`bash
   cp -r . /path/to/your-project/.agent-ps
   \`\`\`

2. Or use the install script:
   \`\`\`bash
   ./scripts/install.sh /path/to/your-project
   \`\`\`

3. Add your API key to \`.devcontainer/.env\`:
   \`\`\`
   ANTHROPIC_API_KEY=your-key-here
   \`\`\`

4. Merge settings from \`templates/devcontainer-fragment.json\` into your \`.devcontainer/devcontainer.json\`

5. Rebuild your devcontainer

## Manual Start

\`\`\`bash
./scripts/start.sh
\`\`\`

## Health Check

\`\`\`bash
./scripts/healthcheck.sh
\`\`\`

## Documentation

See \`docs/INTEGRATION.md\` for detailed integration instructions.
`;
}

function generateIntegrationDoc(config: BundleConfig): string {
  return `# Agent-PS Integration Guide

## Overview

Agent-PS is a web API that enables inbox/outbox communication between AI agents.
This bundle contains everything needed to run Agent-PS in your project's devcontainer.

## Bundle Contents

\`\`\`
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
\`\`\`

## Installation

### Option 1: Manual Copy

\`\`\`bash
# From the bundle directory
cp -r . /path/to/your-project/.agent-ps
\`\`\`

### Option 2: Install Script

\`\`\`bash
./scripts/install.sh /path/to/your-project
\`\`\`

## Configuration

### 1. Environment Variables

Create or edit \`.devcontainer/.env\`:

\`\`\`bash
# Required
ANTHROPIC_API_KEY=your-api-key-here

# Optional
AGENT_PS_PORT=4111
MESSAGES_ROOT=/custom/path/to/messages
LOG_LEVEL=info
\`\`\`

### 2. Devcontainer Configuration

Merge the following into your \`.devcontainer/devcontainer.json\`:

\`\`\`json
{
  "containerEnv": {
    "AGENT_PS_ROOT": "/workspaces/\${localWorkspaceFolderBasename}/.agent-ps/runtime",
    "MESSAGES_ROOT": "/workspaces/\${localWorkspaceFolderBasename}/.agent-ps/messages"
  },
  "forwardPorts": [4111],
  "postStartCommand": "bash \${containerWorkspaceFolder}/.agent-ps/scripts/start.sh &"
}
\`\`\`

### 3. Rebuild Container

After configuration, rebuild your devcontainer to apply changes.

## Usage

### Starting the Server

The server starts automatically via \`postStartCommand\`.
To start manually:

\`\`\`bash
./.agent-ps/scripts/start.sh
\`\`\`

### Health Check

\`\`\`bash
./.agent-ps/scripts/healthcheck.sh
\`\`\`

Or via curl:

\`\`\`bash
curl http://localhost:4111/
\`\`\`

### API Endpoints

The server exposes endpoints for agent communication:

- \`GET /\` - Server info
- \`GET /api\` - API info
- Message folder endpoints (configured via MESSAGES_ROOT)

## Message Format

Messages are Markdown files with YAML frontmatter:

\`\`\`markdown
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
\`\`\`

## Troubleshooting

### Server Won't Start

1. Check Node.js version: \`node -v\` (requires 22+)
2. Verify dependencies: \`cd runtime && npm install\`
3. Check logs for errors

### Port Already in Use

Change the port in your environment:

\`\`\`bash
AGENT_PS_PORT=4112
\`\`\`

### Missing API Key

Ensure \`ANTHROPIC_API_KEY\` is set in \`.devcontainer/.env\`

## Requirements

- Node.js 22.13.0 or later
- npm (for dependency installation)
`;
}

function createBundle(config: BundleConfig): void {
  const bundleDir = config.outputDir;

  log(`Creating bundle v${config.version}...`);

  // Clean existing bundle
  if (existsSync(bundleDir)) {
    log("Cleaning existing bundle...");
    rmSync(bundleDir, { recursive: true });
  }

  // Create directory structure
  log("Creating directory structure...");
  ensureDir(join(bundleDir, "runtime"));
  ensureDir(join(bundleDir, "templates"));
  ensureDir(join(bundleDir, "scripts"));
  ensureDir(join(bundleDir, "docs"));
  ensureDir(join(bundleDir, "messages", "inbox"));
  ensureDir(join(bundleDir, "messages", "outbox"));
  ensureDir(join(bundleDir, "messages", "bugs"));
  ensureDir(join(bundleDir, "messages", "feature-requests"));

  // Copy Mastra output to runtime
  log("Copying runtime files...");
  const excludePatterns = config.includeNodeModules ? [] : ["node_modules"];
  copyDirectory(config.mastraOutput, join(bundleDir, "runtime"), {
    exclude: excludePatterns,
  });

  // Copy templates
  log("Copying templates...");
  copyDirectory(config.templatesDir, join(bundleDir, "templates"));

  // Copy scripts (from templates/scripts to bundle/scripts)
  log("Copying scripts...");
  const scriptsSource = join(config.templatesDir, "scripts");
  const scriptsDest = join(bundleDir, "scripts");
  if (existsSync(scriptsSource)) {
    copyDirectory(scriptsSource, scriptsDest);
    // Make scripts executable
    for (const file of readdirSync(scriptsDest)) {
      if (file.endsWith(".sh")) {
        chmodSync(join(scriptsDest, file), 0o755);
      }
    }
  }

  // Create .gitkeep files in message directories
  const messageDirs = ["inbox", "outbox", "bugs", "feature-requests"];
  for (const dir of messageDirs) {
    writeFileSync(join(bundleDir, "messages", dir, ".gitkeep"), "");
  }

  // Generate bundle.json
  log("Generating bundle metadata...");
  const metadata = generateBundleJson(config);
  writeFileSync(
    join(bundleDir, "bundle.json"),
    JSON.stringify(metadata, null, 2)
  );

  // Generate README.md
  log("Generating README...");
  writeFileSync(join(bundleDir, "README.md"), generateReadme(config));

  // Generate INTEGRATION.md
  log("Generating integration documentation...");
  writeFileSync(
    join(bundleDir, "docs", "INTEGRATION.md"),
    generateIntegrationDoc(config)
  );

  log(`Bundle created at: ${bundleDir}`);
}

function main(): void {
  const version = getVersion();
  const mastraOutput = join(PROJECT_ROOT, ".mastra", "output");
  const templatesDir = join(PROJECT_ROOT, "templates");
  const bundlesDir = join(REPO_ROOT, ".bundles");

  // Validate Mastra output exists
  if (!existsSync(mastraOutput)) {
    error("Mastra output not found. Run 'npm run build' first.");
    process.exit(1);
  }

  // Validate templates exist
  if (!existsSync(templatesDir)) {
    error("Templates directory not found.");
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  const includeNodeModules = args.includes("--full");
  const variant = includeNodeModules ? "full" : "minimal";

  const outputDir = join(bundlesDir, `agent-ps-${version}`);

  const config: BundleConfig = {
    outputDir,
    mastraOutput,
    templatesDir,
    includeNodeModules,
    version,
  };

  createBundle(config);

  // Print summary
  console.log("");
  console.log("Bundle Summary");
  console.log("==============");
  console.log(`Version:  ${version}`);
  console.log(`Variant:  ${variant}`);
  console.log(`Location: ${outputDir}`);
  console.log("");
  console.log("To test the bundle:");
  console.log(`  mkdir /tmp/test-project`);
  console.log(`  cp -r ${outputDir} /tmp/test-project/.agent-ps`);
  console.log(`  cd /tmp/test-project/.agent-ps`);
  if (!includeNodeModules) {
    console.log(`  npm install --prefix runtime`);
  }
  console.log(`  ./scripts/start.sh`);
}

main();
