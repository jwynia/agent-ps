import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const processMessageStep = createStep({
  id: 'process-message',
  description: 'Process an incoming message using the concierge agent',
  inputSchema: z.object({
    filename: z.string().describe('The filename of the message to process'),
    endpoint: z.string().default('inbox').describe('The endpoint the message came from'),
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
    endpoint: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const agent = mastra?.getAgent('conciergeAgent');
    if (!agent) {
      throw new Error('Concierge agent not found');
    }

    const prompt = `
Process the message with filename: ${inputData.filename} from endpoint: ${inputData.endpoint}

Steps:
1. Read the message using the read-message tool with endpoint: "${inputData.endpoint}"
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
      endpoint: inputData.endpoint,
    };
  },
});

export const messageWorkflow = createWorkflow({
  id: 'message-workflow',
  description: 'Process a message file from any endpoint and generate an appropriate response',
  inputSchema: z.object({
    filename: z.string().describe('The filename of the message to process'),
    endpoint: z.string().default('inbox').describe('The endpoint the message came from'),
  }),
  outputSchema: z.object({
    processed: z.boolean(),
    responseId: z.string().optional(),
    summary: z.string(),
    endpoint: z.string(),
  }),
}).then(processMessageStep);

messageWorkflow.commit();

// Legacy export for backwards compatibility
export const inboxWorkflow = messageWorkflow;
