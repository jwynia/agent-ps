import type { Mastra } from '@mastra/core/mastra';
import type { Agent } from '@mastra/core/agent';

/**
 * Route definition for message handling
 */
export interface MessageRoute {
  /** Endpoint ID to match (or '*' for all endpoints) */
  endpoint: string;
  /** Message type to match from frontmatter (or '*' for all types) */
  type: string;
  /** Handler type: 'agent' or 'workflow' */
  handlerType: 'agent' | 'workflow';
  /** ID of the agent or workflow to use */
  handlerId: string;
  /** Optional priority (higher = checked first, default: 0) */
  priority?: number;
}

/**
 * Router configuration
 */
export interface RouterConfig {
  routes: MessageRoute[];
  /** Default handler when no route matches */
  defaultHandler: {
    handlerType: 'agent' | 'workflow';
    handlerId: string;
  };
}

/**
 * Default router configuration
 * Routes messages based on endpoint and type to appropriate handlers
 */
export const defaultRouterConfig: RouterConfig = {
  routes: [
    // Bug reports get special handling
    {
      endpoint: 'bugs',
      type: '*',
      handlerType: 'agent',
      handlerId: 'conciergeAgent',
      priority: 10,
    },
    // Feature requests get special handling
    {
      endpoint: 'feature-requests',
      type: '*',
      handlerType: 'agent',
      handlerId: 'conciergeAgent',
      priority: 10,
    },
    // Questions go through the workflow
    {
      endpoint: '*',
      type: 'question',
      handlerType: 'workflow',
      handlerId: 'messageWorkflow',
      priority: 5,
    },
    // Tasks go through the workflow
    {
      endpoint: '*',
      type: 'task',
      handlerType: 'workflow',
      handlerId: 'messageWorkflow',
      priority: 5,
    },
  ],
  defaultHandler: {
    handlerType: 'agent',
    handlerId: 'conciergeAgent',
  },
};

/**
 * Message router that dispatches messages to the appropriate handler
 */
export class MessageRouter {
  private config: RouterConfig;
  private mastra: Mastra;

  constructor(mastra: Mastra, config: RouterConfig = defaultRouterConfig) {
    this.mastra = mastra;
    this.config = config;
  }

  /**
   * Find the matching route for a message
   */
  findRoute(endpoint: string, messageType?: string): MessageRoute | null {
    // Sort routes by priority (descending)
    const sortedRoutes = [...this.config.routes].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    for (const route of sortedRoutes) {
      const endpointMatch = route.endpoint === '*' || route.endpoint === endpoint;
      const typeMatch = route.type === '*' || route.type === (messageType ?? '*');

      if (endpointMatch && typeMatch) {
        return route;
      }
    }

    return null;
  }

  /**
   * Route and process a message
   */
  async routeMessage(
    filename: string,
    endpoint: string,
    messageType?: string
  ): Promise<{ handler: string; result: string }> {
    const route = this.findRoute(endpoint, messageType);
    const handler = route ?? this.config.defaultHandler;

    if (handler.handlerType === 'workflow') {
      const workflow = this.mastra.getWorkflow(handler.handlerId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${handler.handlerId}`);
      }

      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { filename, endpoint },
      });

      const summary = typeof result === 'object' && result !== null && 'summary' in result
        ? String(result.summary)
        : 'Processed via workflow';

      return { handler: handler.handlerId, result: summary };
    } else {
      const agent = this.mastra.getAgent(handler.handlerId);
      if (!agent) {
        throw new Error(`Agent not found: ${handler.handlerId}`);
      }

      const typeInfo = messageType ? ` (type: ${messageType})` : '';
      const response = await agent.generate([
        {
          role: 'user',
          content: `Process the message with filename: ${filename} from endpoint: ${endpoint}${typeInfo}. Read it and respond appropriately.`,
        },
      ]);

      return { handler: handler.handlerId, result: response.text };
    }
  }
}
