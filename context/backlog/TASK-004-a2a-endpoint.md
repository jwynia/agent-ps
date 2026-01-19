# TASK-004: Set Up A2A Endpoint

## Status: blocked
## Priority: medium
## Size: medium
## Created: 2026-01-19

## Description

Expose the inbox processing agent via A2A (Agent-to-Agent) protocol, allowing external AI agents to communicate with the system through a standardized interface.

## Acceptance Criteria

- [ ] A2A protocol endpoint exposed via Hono
- [ ] Agent card served at well-known URL
- [ ] Message receiving endpoint
- [ ] Task status endpoint
- [ ] Integration with inbox processing agent

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- **TASK-003** must be completed (provides inbox agent and workflow)

## Implementation Plan

### A2A Protocol Overview

A2A (Agent-to-Agent) is a protocol that enables AI agents to communicate. Key components:
- **Agent Card**: JSON metadata describing the agent's capabilities (served at `/.well-known/agent.json`)
- **Message Endpoint**: Receives messages from external agents
- **Task Endpoint**: Tracks async task status

### Step 1: Create Hono server configuration

**File:** `code/src/server.ts`

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mastra } from './mastra/index';
import { a2aRouter } from './routes/a2a';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// A2A routes
app.route('/', a2aRouter);

// Mastra API routes (if needed alongside A2A)
// app.route('/api', mastraApiRouter);

export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '3000');
  console.log(`Server starting on port ${port}`);
  serve({ fetch: app.fetch, port });
}
```

### Step 2: Create A2A agent card schema

**File:** `code/src/mastra/schemas/a2a.ts`

```typescript
import { z } from 'zod';

// A2A Agent Card schema (per A2A spec)
export const agentCardSchema = z.object({
  name: z.string(),
  description: z.string(),
  url: z.string().url(),
  version: z.string().default('1.0.0'),
  capabilities: z.object({
    streaming: z.boolean().default(false),
    pushNotifications: z.boolean().default(false),
    stateTransitionHistory: z.boolean().default(false),
  }),
  defaultInputModes: z.array(z.string()).default(['text']),
  defaultOutputModes: z.array(z.string()).default(['text']),
  skills: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
  })).default([]),
});

// A2A Message schema
export const a2aMessageSchema = z.object({
  id: z.string(),
  type: z.enum(['task', 'query', 'notification']),
  content: z.object({
    text: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  metadata: z.object({
    sender: z.string(),
    timestamp: z.string(),
    replyTo: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }),
});

// A2A Task Response
export const a2aTaskResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentCard = z.infer<typeof agentCardSchema>;
export type A2AMessage = z.infer<typeof a2aMessageSchema>;
export type A2ATaskResponse = z.infer<typeof a2aTaskResponseSchema>;
```

### Step 3: Create A2A routes

**File:** `code/src/routes/a2a.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'crypto';
import { agentCardSchema, a2aMessageSchema, A2AMessage, A2ATaskResponse } from '../mastra/schemas/a2a';
import { mastra } from '../mastra/index';
import { MessageWriter } from '../mastra/services/message-writer';
import { defaultFolderConfig } from '../mastra/config/folders';

const a2aRouter = new Hono();

// In-memory task store (replace with persistent storage in production)
const tasks = new Map<string, A2ATaskResponse>();

// Agent Card endpoint
a2aRouter.get('/.well-known/agent.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;

  const agentCard = agentCardSchema.parse({
    name: 'Agent-PS Inbox Agent',
    description: 'An agent that processes messages via folder-based inbox/outbox communication',
    url: baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    skills: [
      {
        id: 'process-message',
        name: 'Process Message',
        description: 'Process an incoming message and generate a response',
      },
      {
        id: 'query-status',
        name: 'Query Status',
        description: 'Get the current status of the agent and pending tasks',
      },
    ],
  });

  return c.json(agentCard);
});

// Message submission endpoint
a2aRouter.post(
  '/a2a/message',
  zValidator('json', a2aMessageSchema),
  async (c) => {
    const message: A2AMessage = c.req.valid('json');
    const taskId = randomUUID();
    const now = new Date().toISOString();

    // Create task record
    const task: A2ATaskResponse = {
      taskId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(taskId, task);

    // Write message to inbox folder
    const writer = new MessageWriter(defaultFolderConfig);
    try {
      await writer.write({
        endpointId: 'inbox',
        content: message.content.text || JSON.stringify(message.content.data),
        frontmatter: {
          a2aTaskId: taskId,
          a2aMessageId: message.id,
          from: message.metadata.sender,
          priority: message.metadata.priority,
          replyTo: message.metadata.replyTo,
          type: message.type,
        },
      });

      task.status = 'processing';
      task.updatedAt = new Date().toISOString();
      tasks.set(taskId, task);

      // Trigger async processing (non-blocking)
      processMessageAsync(taskId, message).catch(console.error);

      return c.json({ taskId, status: 'accepted' }, 202);
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.updatedAt = new Date().toISOString();
      tasks.set(taskId, task);

      return c.json({ taskId, status: 'failed', error: task.error }, 500);
    }
  }
);

// Task status endpoint
a2aRouter.get('/a2a/task/:taskId', (c) => {
  const { taskId } = c.req.param();
  const task = tasks.get(taskId);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json(task);
});

// List recent tasks
a2aRouter.get('/a2a/tasks', (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const taskList = Array.from(tasks.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return c.json({ tasks: taskList, total: tasks.size });
});

// Async message processing
async function processMessageAsync(taskId: string, message: A2AMessage): Promise<void> {
  const task = tasks.get(taskId);
  if (!task) return;

  try {
    const agent = mastra.getAgent('inboxAgent');
    if (!agent) {
      throw new Error('Inbox agent not found');
    }

    const response = await agent.generate([
      {
        role: 'user',
        content: `Process this A2A message:\n\nType: ${message.type}\nFrom: ${message.metadata.sender}\nContent: ${message.content.text || JSON.stringify(message.content.data)}`,
      },
    ]);

    task.status = 'completed';
    task.result = { response: response.text };
    task.updatedAt = new Date().toISOString();
    tasks.set(taskId, task);
  } catch (error) {
    task.status = 'failed';
    task.error = error instanceof Error ? error.message : 'Unknown error';
    task.updatedAt = new Date().toISOString();
    tasks.set(taskId, task);
  }
}

export { a2aRouter };
```

### Step 4: Install Hono dependencies

```bash
cd code
npm install hono @hono/node-server @hono/zod-validator
```

### Step 5: Create routes directory

```bash
mkdir -p code/src/routes
```

### Step 6: Update package.json scripts

Add to `code/package.json`:

```json
{
  "scripts": {
    "server": "tsx src/server.ts",
    "server:dev": "tsx watch src/server.ts"
  }
}
```

Install tsx for running TypeScript:

```bash
cd code
npm install -D tsx
```

### Step 7: Update barrel exports

**File:** `code/src/mastra/index.ts` - Add:

```typescript
export { agentCardSchema, a2aMessageSchema, a2aTaskResponseSchema } from './schemas/a2a';
export type { AgentCard, A2AMessage, A2ATaskResponse } from './schemas/a2a';
```

## Verification

```bash
cd code
npm run server:dev

# Test agent card
curl http://localhost:3000/.well-known/agent.json

# Test message submission
curl -X POST http://localhost:3000/a2a/message \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-msg-1",
    "type": "query",
    "content": { "text": "Hello, what can you do?" },
    "metadata": {
      "sender": "test-agent",
      "timestamp": "2026-01-19T12:00:00Z"
    }
  }'

# Check task status
curl http://localhost:3000/a2a/task/{taskId}
```

## Patterns to Follow

- Use Hono for routing (lightweight, TypeScript-native)
- Zod validation middleware for request validation
- Async task pattern for long-running agent operations
- Return 202 Accepted for async operations

## Notes

- Task storage is in-memory; for production, integrate with Mastra's LibSQL storage
- Consider adding authentication for production deployments
- Webhook callbacks could be added for push notifications

## Related

- [domains/protocols/README.md](../domains/protocols/README.md)
- [glossary.md](../glossary.md) - A2A definition
- TASK-003 (inbox processing agent)
