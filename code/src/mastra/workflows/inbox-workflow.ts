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
1. Read the message using the read-message tool
2. Analyze its content and intent
3. If a response is appropriate, write one using the write-response tool
4. Summarize what action was taken
`;

    const response = await agent.generate([
      { role: 'user', content: prompt }
    ]);

    return {
      processed: true,
      responseId: undefined,
      summary: response.text,
    };
  },
});

export const inboxWorkflow = createWorkflow({
  id: 'inbox-workflow',
  description: 'Process an inbox message file and generate an appropriate response',
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
