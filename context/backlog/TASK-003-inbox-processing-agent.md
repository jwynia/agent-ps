# TASK-003: Create Inbox Processing Agent

## Status: completed
## Priority: high
## Size: large
## Created: 2026-01-19
## Completed: 2026-01-19

## Description

Build a Mastra agent that processes incoming messages from the inbox folder. The agent should read messages, extract metadata, and route them appropriately.

## Acceptance Criteria

- [x] Mastra agent definition with appropriate tools
- [x] Read and parse inbox messages
- [x] Extract YAML frontmatter metadata
- [x] Route messages based on content/metadata
- [x] Write responses to outbox folder
- [x] Handle correspondence chains (reply-to tracking)

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- **TASK-001** ~~must be completed~~ **COMPLETED** (provides configuration schemas)
- **TASK-002** ~~must be completed~~ **COMPLETED** (provides FolderWatcher and MessageWriter)

## Implementation Plan

### Step 1: Create inbox tools

**File:** `code/src/mastra/tools/inbox-tools.ts`

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

// Tool to list messages in inbox
export const listInboxTool = createTool({
  id: 'list-inbox',
  description: 'List all messages currently in the inbox folder',
  inputSchema: z.object({
    limit: z.number().default(10).describe('Maximum number of messages to return'),
  }),
  outputSchema: z.object({
    messages: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      from: z.string().optional(),
      subject: z.string().optional(),
      timestamp: z.string().optional(),
    })),
    total: z.number(),
  }),
  execute: async ({ limit }) => {
    const inboxPath = join(process.cwd(), '../.agents/messages/inbox');
    const files = await readdir(inboxPath).catch(() => []);
    const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, limit);

    const messages = await Promise.all(
      mdFiles.map(async (filename) => {
        const content = await readFile(join(inboxPath, filename), 'utf-8');
        const { data } = matter(content);
        return {
          id: data.id || filename,
          filename,
          from: data.from,
          subject: data.subject,
          timestamp: data.timestamp,
        };
      })
    );

    return { messages, total: files.filter(f => f.endsWith('.md')).length };
  },
});

// Tool to read a specific message
export const readMessageTool = createTool({
  id: 'read-message',
  description: 'Read the full content of a specific inbox message',
  inputSchema: z.object({
    filename: z.string().describe('The filename of the message to read'),
  }),
  outputSchema: z.object({
    id: z.string(),
    from: z.string().optional(),
    subject: z.string().optional(),
    timestamp: z.string().optional(),
    replyTo: z.string().optional(),
    content: z.string(),
    frontmatter: z.record(z.unknown()),
  }),
  execute: async ({ filename }) => {
    const filePath = join(process.cwd(), '../.agents/messages/inbox', filename);
    const fileContent = await readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      id: data.id || filename,
      from: data.from,
      subject: data.subject,
      timestamp: data.timestamp,
      replyTo: data.replyTo,
      content: content.trim(),
      frontmatter: data,
    };
  },
});

// Tool to write a response to outbox
export const writeResponseTool = createTool({
  id: 'write-response',
  description: 'Write a response message to the outbox folder',
  inputSchema: z.object({
    to: z.string().describe('Recipient identifier'),
    subject: z.string().describe('Message subject'),
    content: z.string().describe('Message body in Markdown'),
    replyTo: z.string().optional().describe('ID of message being replied to'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filename: z.string(),
    id: z.string(),
  }),
  execute: async ({ to, subject, content, replyTo }) => {
    const { writeFile, mkdir } = await import('fs/promises');
    const { randomUUID } = await import('crypto');

    const id = randomUUID();
    const filename = `${id}.md`;
    const outboxPath = join(process.cwd(), '../.agents/messages/outbox');

    await mkdir(outboxPath, { recursive: true });

    const frontmatter = {
      id,
      to,
      subject,
      timestamp: new Date().toISOString(),
      from: 'inbox-agent',
      ...(replyTo && { replyTo }),
    };

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${content}`;

    await writeFile(join(outboxPath, filename), fileContent, 'utf-8');

    return { success: true, filename, id };
  },
});
```

### Step 2: Create inbox processing agent

**File:** `code/src/mastra/agents/inbox-agent.ts`

```typescript
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { listInboxTool, readMessageTool, writeResponseTool } from '../tools/inbox-tools';

export const inboxAgent = new Agent({
  id: 'inbox-agent',
  name: 'Inbox Processing Agent',
  instructions: `
You are an inbox processing agent that handles incoming messages from other AI agents and users.

Your responsibilities:
1. Monitor and process messages in the inbox folder
2. Understand the intent and content of each message
3. Route messages appropriately based on their type:
   - Questions: Formulate helpful responses
   - Tasks: Acknowledge and track
   - Information: Acknowledge receipt
   - Errors/Issues: Log and escalate if needed

4. Write responses to the outbox folder when appropriate
5. Maintain conversation threads using replyTo references

When processing messages:
- Always read the full message content before responding
- Include relevant context from the original message in replies
- Use clear, professional language
- Set appropriate subject lines that reflect the conversation topic

Available tools:
- list-inbox: See what messages are waiting
- read-message: Read a specific message in full
- write-response: Send a reply to the outbox

Always acknowledge messages and provide helpful responses.
`,
  model: 'anthropic/claude-sonnet-4-5',
  tools: { listInboxTool, readMessageTool, writeResponseTool },
  memory: new Memory(),
});
```

### Step 3: Create inbox workflow

**File:** `code/src/mastra/workflows/inbox-workflow.ts`

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const processMessageStep = createStep({
  id: 'process-message',
  description: 'Process an incoming inbox message using the inbox agent',
  inputSchema: z.object({
    filename: z.string().describe('The filename of the message to process'),
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const agent = mastra?.getAgent('inboxAgent');
    if (!agent) {
      throw new Error('Inbox agent not found');
    }

    const prompt = `
      Process the inbox message with filename: ${inputData.filename}

      Steps:
      1. Read the message using read-message tool
      2. Analyze its content and intent
      3. If a response is appropriate, write one using write-response tool
      4. Summarize what action was taken
    `;

    const response = await agent.generate([
      { role: 'user', content: prompt }
    ]);

    return {
      processed: true,
      responseId: undefined, // Could extract from tool calls
      summary: response.text,
    };
  },
});

export const inboxWorkflow = createWorkflow({
  id: 'inbox-workflow',
  inputSchema: z.object({
    filename: z.string().describe('The filename of the message to process'),
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
  }),
}).then(processMessageStep);

inboxWorkflow.commit();
```

### Step 4: Register agent and workflow in Mastra

**File:** `code/src/mastra/index.ts` - Update to include:

```typescript
import { inboxAgent } from './agents/inbox-agent';
import { inboxWorkflow } from './workflows/inbox-workflow';

// In the Mastra config:
export const mastra = new Mastra({
  workflows: { weatherWorkflow, inboxWorkflow },
  agents: { weatherAgent, inboxAgent },
  // ... rest of config
});
```

### Step 5: Connect folder watcher to workflow

**File:** `code/src/mastra/services/inbox-processor.ts`

```typescript
import { FolderWatcher } from './folder-watcher';
import { FolderConfig } from '../schemas/folder-config';
import { FolderEvent } from '../schemas/message';
import { mastra } from '../index';

export class InboxProcessor {
  private watcher: FolderWatcher;

  constructor(config: FolderConfig) {
    this.watcher = new FolderWatcher(config);
    this.watcher.on('message', this.handleEvent.bind(this));
  }

  async start(): Promise<void> {
    await this.watcher.start();
    console.log('Inbox processor started');
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
  }

  private async handleEvent(event: FolderEvent): Promise<void> {
    if (event.type === 'message:created') {
      console.log(`New message: ${event.message.filePath}`);

      // Trigger the inbox workflow
      const workflow = mastra.getWorkflow('inboxWorkflow');
      if (workflow) {
        const result = await workflow.execute({
          triggerData: {
            filename: event.message.filePath.split('/').pop()!,
          },
        });
        console.log('Workflow result:', result);
      }
    }
  }
}
```

## Patterns to Follow

- Agent pattern from `code/src/mastra/agents/weather-agent.ts`
- Tool pattern from `code/src/mastra/tools/weather-tool.ts`
- Workflow pattern from `code/src/mastra/workflows/weather-workflow.ts`
- Use `anthropic/claude-sonnet-4-5` as the model (from existing agent)

## Verification

```bash
cd code
npm run build  # Should compile without errors
npm run dev    # Start Mastra dev server

# Test via Mastra Studio or API:
# POST to /api/agents/inbox-agent/generate
```

## Related

- [domains/agents/README.md](../domains/agents/README.md)
- TASK-001 (configuration schema)
- TASK-002 (folder watching service)
