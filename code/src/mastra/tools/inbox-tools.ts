import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import matter from 'gray-matter';

const INBOX_PATH = join(process.cwd(), '../.agents/messages/inbox');
const OUTBOX_PATH = join(process.cwd(), '../.agents/messages/outbox');

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
    const files = await readdir(INBOX_PATH).catch(() => []);
    const mdFiles = files.filter(f => f.endsWith('.md')).slice(0, limit);

    const messages = await Promise.all(
      mdFiles.map(async (filename) => {
        try {
          const content = await readFile(join(INBOX_PATH, filename), 'utf-8');
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
    const filePath = join(INBOX_PATH, filename);
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
    const id = randomUUID();
    const filename = `${id}.md`;

    await mkdir(OUTBOX_PATH, { recursive: true });

    const frontmatter: Record<string, unknown> = {
      id,
      to,
      subject,
      timestamp: new Date().toISOString(),
      from: 'inbox-agent',
    };

    if (replyTo) {
      frontmatter.replyTo = replyTo;
    }

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${content}`;

    await writeFile(join(OUTBOX_PATH, filename), fileContent, 'utf-8');

    return { success: true, filename, id };
  },
});
