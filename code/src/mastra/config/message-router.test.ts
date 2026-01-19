import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRouter, type RouterConfig, defaultRouterConfig } from './message-router';
import type { Mastra } from '@mastra/core/mastra';
import type { Agent } from '@mastra/core/agent';

describe('MessageRouter', () => {
  // Mock Mastra instance
  const mockAgent = {
    generate: vi.fn().mockResolvedValue({ text: 'Agent response' }),
  } as unknown as Agent;

  const mockWorkflowRun = {
    start: vi.fn().mockResolvedValue({ summary: 'Workflow result' }),
  };

  const mockWorkflow = {
    createRun: vi.fn().mockResolvedValue(mockWorkflowRun),
  };

  const mockMastra = {
    getAgent: vi.fn().mockReturnValue(mockAgent),
    getWorkflow: vi.fn().mockReturnValue(mockWorkflow),
  } as unknown as Mastra;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findRoute', () => {
    const testConfig: RouterConfig = {
      routes: [
        { endpoint: 'bugs', type: '*', handlerType: 'agent', handlerId: 'bugAgent', priority: 10 },
        { endpoint: 'feature-requests', type: '*', handlerType: 'agent', handlerId: 'featureAgent', priority: 10 },
        { endpoint: '*', type: 'question', handlerType: 'workflow', handlerId: 'qaWorkflow', priority: 5 },
        { endpoint: '*', type: 'task', handlerType: 'workflow', handlerId: 'taskWorkflow', priority: 5 },
        { endpoint: 'inbox', type: 'urgent', handlerType: 'agent', handlerId: 'urgentAgent', priority: 15 },
      ],
      defaultHandler: { handlerType: 'agent', handlerId: 'defaultAgent' },
    };

    let router: MessageRouter;

    beforeEach(() => {
      router = new MessageRouter(mockMastra, testConfig);
    });

    it('matches specific endpoint route', () => {
      const route = router.findRoute('bugs', 'any-type');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('bugAgent');
    });

    it('matches wildcard endpoint with specific type', () => {
      const route = router.findRoute('inbox', 'question');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('qaWorkflow');
    });

    it('matches by priority - higher priority wins', () => {
      // inbox + urgent should match urgentAgent (priority 15) over question/task workflows (priority 5)
      const route = router.findRoute('inbox', 'urgent');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('urgentAgent');
    });

    it('matches endpoint wildcard over type wildcard when same priority', () => {
      // bugs endpoint (priority 10) should match over question type (priority 5)
      const route = router.findRoute('bugs', 'question');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('bugAgent');
    });

    it('returns null when no route matches', () => {
      const route = router.findRoute('inbox', 'unknown-type');
      expect(route).toBeNull();
    });

    it('returns null for completely unknown endpoint and type', () => {
      const route = router.findRoute('random-endpoint', 'random-type');
      expect(route).toBeNull();
    });

    it('matches wildcard type on specific endpoint', () => {
      const route = router.findRoute('feature-requests', 'enhancement');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('featureAgent');
    });

    it('handles undefined message type', () => {
      // With undefined type, should still match bugs endpoint
      const route = router.findRoute('bugs', undefined);
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('bugAgent');
    });
  });

  describe('findRoute with default config', () => {
    let router: MessageRouter;

    beforeEach(() => {
      router = new MessageRouter(mockMastra);
    });

    it('uses defaultRouterConfig when no config provided', () => {
      // The default config has bugs endpoint routed to conciergeAgent
      const route = router.findRoute('bugs', 'any');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('conciergeAgent');
    });

    it('routes questions to messageWorkflow in default config', () => {
      const route = router.findRoute('inbox', 'question');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('messageWorkflow');
    });

    it('routes tasks to messageWorkflow in default config', () => {
      const route = router.findRoute('inbox', 'task');
      expect(route).not.toBeNull();
      expect(route!.handlerId).toBe('messageWorkflow');
    });
  });

  describe('routeMessage', () => {
    const testConfig: RouterConfig = {
      routes: [
        { endpoint: 'bugs', type: '*', handlerType: 'agent', handlerId: 'bugAgent', priority: 10 },
        { endpoint: '*', type: 'question', handlerType: 'workflow', handlerId: 'qaWorkflow', priority: 5 },
      ],
      defaultHandler: { handlerType: 'agent', handlerId: 'defaultAgent' },
    };

    let router: MessageRouter;

    beforeEach(() => {
      router = new MessageRouter(mockMastra, testConfig);
    });

    it('routes to agent and returns result', async () => {
      const result = await router.routeMessage('bug-123.md', 'bugs', 'bug-report');

      expect(mockMastra.getAgent).toHaveBeenCalledWith('bugAgent');
      expect(mockAgent.generate).toHaveBeenCalled();
      expect(result.handler).toBe('bugAgent');
      expect(result.result).toBe('Agent response');
    });

    it('routes to workflow and returns result', async () => {
      const result = await router.routeMessage('question.md', 'inbox', 'question');

      expect(mockMastra.getWorkflow).toHaveBeenCalledWith('qaWorkflow');
      expect(mockWorkflow.createRun).toHaveBeenCalled();
      expect(mockWorkflowRun.start).toHaveBeenCalledWith({
        inputData: { filename: 'question.md', endpoint: 'inbox' },
      });
      expect(result.handler).toBe('qaWorkflow');
      expect(result.result).toBe('Workflow result');
    });

    it('uses default handler when no route matches', async () => {
      const result = await router.routeMessage('unknown.md', 'inbox', 'random');

      expect(mockMastra.getAgent).toHaveBeenCalledWith('defaultAgent');
      expect(result.handler).toBe('defaultAgent');
    });

    it('throws error when agent not found', async () => {
      (mockMastra.getAgent as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      await expect(router.routeMessage('test.md', 'bugs', 'bug')).rejects.toThrow(
        'Agent not found: bugAgent'
      );
    });

    it('throws error when workflow not found', async () => {
      (mockMastra.getWorkflow as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      await expect(router.routeMessage('question.md', 'inbox', 'question')).rejects.toThrow(
        'Workflow not found: qaWorkflow'
      );
    });

    it('passes message type info to agent', async () => {
      await router.routeMessage('bug.md', 'bugs', 'critical-bug');

      const generateCall = (mockAgent.generate as ReturnType<typeof vi.fn>).mock.calls[0];
      const message = generateCall[0][0];
      expect(message.content).toContain('critical-bug');
      expect(message.content).toContain('bugs');
      expect(message.content).toContain('bug.md');
    });

    it('handles workflow result without summary property', async () => {
      mockWorkflowRun.start.mockResolvedValueOnce({ otherData: 'no summary' });

      const result = await router.routeMessage('question.md', 'inbox', 'question');

      expect(result.result).toBe('Processed via workflow');
    });

    it('handles null workflow result', async () => {
      mockWorkflowRun.start.mockResolvedValueOnce(null);

      const result = await router.routeMessage('question.md', 'inbox', 'question');

      expect(result.result).toBe('Processed via workflow');
    });
  });

  describe('priority ordering', () => {
    it('sorts routes by priority descending', () => {
      const config: RouterConfig = {
        routes: [
          { endpoint: 'inbox', type: 'a', handlerType: 'agent', handlerId: 'low', priority: 1 },
          { endpoint: 'inbox', type: 'a', handlerType: 'agent', handlerId: 'high', priority: 100 },
          { endpoint: 'inbox', type: 'a', handlerType: 'agent', handlerId: 'medium', priority: 50 },
        ],
        defaultHandler: { handlerType: 'agent', handlerId: 'default' },
      };

      const router = new MessageRouter(mockMastra, config);
      const route = router.findRoute('inbox', 'a');

      expect(route!.handlerId).toBe('high');
    });

    it('handles routes without priority (defaults to 0)', () => {
      const config: RouterConfig = {
        routes: [
          { endpoint: 'inbox', type: 'a', handlerType: 'agent', handlerId: 'noPriority' },
          { endpoint: 'inbox', type: 'a', handlerType: 'agent', handlerId: 'hasPriority', priority: 1 },
        ],
        defaultHandler: { handlerType: 'agent', handlerId: 'default' },
      };

      const router = new MessageRouter(mockMastra, config);
      const route = router.findRoute('inbox', 'a');

      expect(route!.handlerId).toBe('hasPriority');
    });
  });
});

describe('defaultRouterConfig', () => {
  it('has bugs endpoint configuration', () => {
    const bugsRoute = defaultRouterConfig.routes.find(r => r.endpoint === 'bugs');
    expect(bugsRoute).toBeDefined();
    expect(bugsRoute!.handlerId).toBe('conciergeAgent');
  });

  it('has feature-requests endpoint configuration', () => {
    const featureRoute = defaultRouterConfig.routes.find(r => r.endpoint === 'feature-requests');
    expect(featureRoute).toBeDefined();
    expect(featureRoute!.handlerId).toBe('conciergeAgent');
  });

  it('has question type routing', () => {
    const questionRoute = defaultRouterConfig.routes.find(r => r.type === 'question');
    expect(questionRoute).toBeDefined();
    expect(questionRoute!.handlerType).toBe('workflow');
  });

  it('has a default handler configured', () => {
    expect(defaultRouterConfig.defaultHandler).toBeDefined();
    expect(defaultRouterConfig.defaultHandler.handlerId).toBe('conciergeAgent');
  });
});
