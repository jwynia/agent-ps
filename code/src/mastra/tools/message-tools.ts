import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import matter from 'gray-matter';
import {
  getEndpointPath,
  getEndpoint,
  listEndpoints as listEndpointsConfig,
  getDefaultOutboxEndpoint,
  defaultFolderConfig,
} from '../config/folders';

// Tool to list available endpoints
export const listEndpointsTool = createTool({
  id: 'list-endpoints',
  description: 'List all available message endpoints (folders) configured in the system',
  inputSchema: z.object({}),
  outputSchema: z.object({
    endpoints: z.array(z.object({
      id: z.string(),
      path: z.string(),
      direction: z.enum(['inbox', 'outbox', 'bidirectional']),
    })),
  }),
  execute: async () => {
    const endpoints = listEndpointsConfig();
    return {
      endpoints: endpoints.map(e => ({
        id: e.id,
        path: e.path,
        direction: e.direction,
      })),
    };
  },
});

// Tool to list messages in any endpoint
export const listMessagesTool = createTool({
  id: 'list-messages',
  description: 'List all messages in a specified endpoint folder',
  inputSchema: z.object({
    endpoint: z.string().default('inbox').describe('The endpoint ID to list messages from (e.g., "inbox", "bugs")'),
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
    endpoint: z.string(),
  }),
  execute: async ({ endpoint, limit }) => {
    const endpointPath = getEndpointPath(endpoint);
    const files = await readdir(endpointPath).catch(() => []);
    const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, limit);

    const messages = await Promise.all(
      mdFiles.map(async (filename) => {
        try {
          const content = await readFile(join(endpointPath, filename), 'utf-8');
          const { data } = matter(content);
          return {
            id: (data.id as string) || filename,
            filename,
            from: data.from as string | undefined,
            subject: data.subject as string | undefined,
            timestamp: data.timestamp as string | undefined,
          };
        } catch {
          return {
            id: filename,
            filename,
            from: undefined,
            subject: undefined,
            timestamp: undefined,
          };
        }
      })
    );

    return {
      messages,
      total: files.filter(f => f.endsWith('.md')).length,
      endpoint,
    };
  },
});

// Tool to read a specific message from any endpoint
export const readMessageTool = createTool({
  id: 'read-message',
  description: 'Read the full content of a specific message from an endpoint',
  inputSchema: z.object({
    endpoint: z.string().default('inbox').describe('The endpoint ID to read from'),
    filename: z.string().describe('The filename of the message to read'),
  }),
  outputSchema: z.object({
    id: z.string(),
    from: z.string().optional(),
    subject: z.string().optional(),
    timestamp: z.string().optional(),
    replyTo: z.string().optional(),
    content: z.string(),
    frontmatter: z.record(z.string(), z.unknown()),
    endpoint: z.string(),
  }),
  execute: async ({ endpoint, filename }) => {
    const endpointPath = getEndpointPath(endpoint);
    const filePath = join(endpointPath, filename);
    const fileContent = await readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      id: (data.id as string) || filename,
      from: data.from as string | undefined,
      subject: data.subject as string | undefined,
      timestamp: data.timestamp as string | undefined,
      replyTo: data.replyTo as string | undefined,
      content: content.trim(),
      frontmatter: data,
      endpoint,
    };
  },
});

// Tool to submit a new message to any inbox-direction endpoint
export const submitMessageTool = createTool({
  id: 'submit-message',
  description: 'Submit a new message to an inbox-direction endpoint (inbox or bidirectional)',
  inputSchema: z.object({
    endpoint: z.string().default('inbox').describe('The endpoint ID to submit to (must be inbox or bidirectional)'),
    from: z.string().describe('Sender identifier'),
    subject: z.string().describe('Message subject'),
    content: z.string().describe('Message body in Markdown'),
    type: z.string().optional().describe('Message type (e.g., "question", "task", "bug-report")'),
    replyTo: z.string().optional().describe('ID of message being replied to'),
    additionalFrontmatter: z.record(z.string(), z.unknown()).optional().describe('Additional frontmatter fields'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filename: z.string(),
    id: z.string(),
    endpoint: z.string(),
  }),
  execute: async ({ endpoint, from, subject, content, type, replyTo, additionalFrontmatter }) => {
    const endpointConfig = getEndpoint(endpoint);
    if (!endpointConfig) {
      throw new Error(`Endpoint not found: ${endpoint}`);
    }

    if (endpointConfig.direction === 'outbox') {
      throw new Error(`Cannot submit to outbox endpoint: ${endpoint}. Use an inbox or bidirectional endpoint.`);
    }

    const endpointPath = getEndpointPath(endpoint);
    const id = randomUUID();
    const filename = `${id}.md`;

    await mkdir(endpointPath, { recursive: true });

    const frontmatter: Record<string, unknown> = {
      id,
      from,
      subject,
      timestamp: new Date().toISOString(),
      ...additionalFrontmatter,
    };

    if (type) {
      frontmatter.type = type;
    }

    if (replyTo) {
      frontmatter.replyTo = replyTo;
    }

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${content}`;

    await writeFile(join(endpointPath, filename), fileContent, 'utf-8');

    return { success: true, filename, id, endpoint };
  },
});

// Tool to write a response to the outbox (or specified endpoint)
export const writeResponseTool = createTool({
  id: 'write-response',
  description: 'Write a response message to the outbox or specified endpoint',
  inputSchema: z.object({
    endpoint: z.string().optional().describe('The endpoint ID to write to (defaults to outbox)'),
    to: z.string().describe('Recipient identifier'),
    subject: z.string().describe('Message subject'),
    content: z.string().describe('Message body in Markdown'),
    replyTo: z.string().optional().describe('ID of message being replied to'),
    from: z.string().optional().describe('Sender identifier (defaults to concierge-agent)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filename: z.string(),
    id: z.string(),
    endpoint: z.string(),
  }),
  execute: async ({ endpoint, to, subject, content, replyTo, from }) => {
    // Default to outbox endpoint if not specified
    let targetEndpoint = endpoint;
    if (!targetEndpoint) {
      const outbox = getDefaultOutboxEndpoint();
      if (!outbox) {
        throw new Error('No outbox endpoint configured');
      }
      targetEndpoint = outbox.id;
    }

    const endpointPath = getEndpointPath(targetEndpoint);
    const id = randomUUID();
    const filename = `${id}.md`;

    await mkdir(endpointPath, { recursive: true });

    const frontmatter: Record<string, unknown> = {
      id,
      to,
      subject,
      timestamp: new Date().toISOString(),
      from: from || 'concierge-agent',
    };

    if (replyTo) {
      frontmatter.replyTo = replyTo;
    }

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${content}`;

    await writeFile(join(endpointPath, filename), fileContent, 'utf-8');

    return { success: true, filename, id, endpoint: targetEndpoint };
  },
});

// Legacy exports for backwards compatibility
export const listInboxTool = listMessagesTool;
