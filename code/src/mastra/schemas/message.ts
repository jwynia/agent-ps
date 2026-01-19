import { z } from 'zod';

// Schema for parsed message from a Markdown file
export const messageSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  endpointId: z.string(),
  frontmatter: z.record(z.unknown()),
  content: z.string(),
  createdAt: z.date(),
  modifiedAt: z.date(),
});

export type Message = z.infer<typeof messageSchema>;

// Event types emitted by the folder watcher
export const folderEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message:created'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message:updated'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message:deleted'),
    filePath: z.string(),
    endpointId: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    filePath: z.string(),
    error: z.string(),
  }),
]);

export type FolderEvent = z.infer<typeof folderEventSchema>;
