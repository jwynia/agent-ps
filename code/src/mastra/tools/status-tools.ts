import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getMessageStatus,
  getAllMessageStatuses,
  messageStatusValue,
} from '../schemas/message-status';

// Tool to get status of a specific message
export const getMessageStatusTool = createTool({
  id: 'get-message-status',
  description: 'Get the processing status of a specific message by ID',
  inputSchema: z.object({
    id: z.string().describe('The message ID to check status for'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    status: z.object({
      id: z.string(),
      status: messageStatusValue,
      endpoint: z.string(),
      filename: z.string(),
      createdAt: z.string(),
      processedAt: z.string().optional(),
      error: z.string().optional(),
      summary: z.string().optional(),
    }).optional(),
  }),
  execute: async ({ id }) => {
    const status = getMessageStatus(id);
    if (!status) {
      return { found: false, status: undefined };
    }
    return { found: true, status };
  },
});

// Tool to list all message statuses
export const listMessageStatusesTool = createTool({
  id: 'list-message-statuses',
  description: 'List processing statuses for all tracked messages',
  inputSchema: z.object({
    filterStatus: messageStatusValue.optional().describe('Filter by status: pending, processing, completed, failed'),
    limit: z.number().default(20).describe('Maximum number of statuses to return'),
  }),
  outputSchema: z.object({
    statuses: z.array(z.object({
      id: z.string(),
      status: messageStatusValue,
      endpoint: z.string(),
      filename: z.string(),
      createdAt: z.string(),
      processedAt: z.string().optional(),
      error: z.string().optional(),
    })),
    total: z.number(),
  }),
  execute: async ({ filterStatus, limit }) => {
    const allStatuses = getAllMessageStatuses(filterStatus);
    const statuses = allStatuses.slice(0, limit).map(s => ({
      id: s.id,
      status: s.status,
      endpoint: s.endpoint,
      filename: s.filename,
      createdAt: s.createdAt,
      processedAt: s.processedAt,
      error: s.error,
    }));
    return { statuses, total: allStatuses.length };
  },
});
