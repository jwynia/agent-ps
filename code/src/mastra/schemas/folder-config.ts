import { z } from 'zod';

// Schema for required YAML frontmatter fields
export const frontmatterFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean', 'array']),
  required: z.boolean().default(false),
  description: z.string().optional(),
});

// Schema for a single folder endpoint
export const folderEndpointSchema = z.object({
  id: z.string().describe('Unique identifier for this endpoint'),
  path: z.string().describe('Relative path from agents folder root'),
  pattern: z.string().default('**/*.md').describe('Glob pattern for files'),
  direction: z.enum(['inbox', 'outbox', 'bidirectional']).default('inbox'),
  requiredFrontmatter: z.array(frontmatterFieldSchema).default([]),
  watchMode: z.enum(['poll', 'fsevents']).default('fsevents'),
  pollIntervalMs: z.number().default(5000).describe('Poll interval if using poll mode'),
});

// Schema for the complete folder configuration
export const folderConfigSchema = z.object({
  rootPath: z.string().describe('Base path for all agent folders'),
  endpoints: z.array(folderEndpointSchema).min(1),
  defaultFrontmatter: z.array(frontmatterFieldSchema).default([
    { name: 'id', type: 'string', required: true },
    { name: 'timestamp', type: 'date', required: true },
    { name: 'from', type: 'string', required: false },
    { name: 'replyTo', type: 'string', required: false },
  ]),
});

// TypeScript types derived from schemas
export type FrontmatterField = z.infer<typeof frontmatterFieldSchema>;
export type FolderEndpoint = z.infer<typeof folderEndpointSchema>;
export type FolderConfig = z.infer<typeof folderConfigSchema>;
