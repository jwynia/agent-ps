# TASK-007: Add Unit and Integration Tests

## Status: ready
## Priority: high
## Size: large
## Created: 2026-01-19

## Description

The project has no tests. Add comprehensive test coverage for schemas, services, tools, and integration flows. This is critical for confidence in refactoring and catching regressions.

## Acceptance Criteria

- [ ] Test framework configured (Vitest recommended for Mastra projects)
- [ ] Schema validation tests for folder-config.ts and message.ts
- [ ] Unit tests for MessageRouter routing logic
- [ ] Unit tests for FolderWatcher (mocked fs events)
- [ ] Unit tests for MessageWriter
- [ ] Integration tests for MessageProcessor (with mocked Mastra)
- [ ] Tool tests using Mastra testing patterns (semantic assertions)
- [ ] CI script to run tests
- [ ] >80% coverage on core services

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- TASK-005 validates the flow works before we test it
- No hard blockers

## Implementation Plan

### Step 1: Install test dependencies

```bash
cd code
npm install -D vitest @vitest/coverage-v8
```

### Step 2: Configure Vitest

**File:** `code/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/mastra/**/*.ts'],
      exclude: ['src/mastra/**/*.test.ts', 'src/mastra/index.ts'],
    },
  },
});
```

### Step 3: Add test scripts to package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Step 4: Schema tests

**File:** `code/src/mastra/schemas/folder-config.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { folderConfigSchema, folderEndpointSchema } from './folder-config';

describe('folderEndpointSchema', () => {
  it('validates a minimal inbox endpoint', () => {
    const endpoint = {
      id: 'inbox',
      path: 'inbox',
      direction: 'inbox',
    };
    expect(() => folderEndpointSchema.parse(endpoint)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    const endpoint = { id: 'inbox' };
    expect(() => folderEndpointSchema.parse(endpoint)).toThrow();
  });

  it('validates direction enum', () => {
    const endpoint = {
      id: 'test',
      path: 'test',
      direction: 'invalid',
    };
    expect(() => folderEndpointSchema.parse(endpoint)).toThrow();
  });
});

describe('folderConfigSchema', () => {
  it('validates complete config', () => {
    const config = {
      rootPath: '.agents/messages',
      endpoints: [
        { id: 'inbox', path: 'inbox', direction: 'inbox' },
      ],
    };
    expect(() => folderConfigSchema.parse(config)).not.toThrow();
  });
});
```

### Step 5: MessageRouter tests

**File:** `code/src/mastra/config/message-router.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRouter, type RouterConfig } from './message-router';
import type { Mastra } from '@mastra/core/mastra';

describe('MessageRouter', () => {
  const mockMastra = {
    getAgent: vi.fn(),
    getWorkflow: vi.fn(),
  } as unknown as Mastra;

  const testConfig: RouterConfig = {
    routes: [
      { endpoint: 'bugs', type: '*', handlerType: 'agent', handlerId: 'bugAgent', priority: 10 },
      { endpoint: '*', type: 'question', handlerType: 'workflow', handlerId: 'qaWorkflow', priority: 5 },
    ],
    defaultHandler: { handlerType: 'agent', handlerId: 'defaultAgent' },
  };

  let router: MessageRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new MessageRouter(mockMastra, testConfig);
  });

  describe('findRoute', () => {
    it('matches specific endpoint over wildcard', () => {
      const route = router.findRoute('bugs', 'question');
      expect(route?.handlerId).toBe('bugAgent');
    });

    it('matches type wildcard', () => {
      const route = router.findRoute('inbox', 'question');
      expect(route?.handlerId).toBe('qaWorkflow');
    });

    it('returns null when no match', () => {
      const route = router.findRoute('inbox', 'task');
      expect(route).toBeNull();
    });

    it('respects priority ordering', () => {
      const route = router.findRoute('bugs', 'question');
      // bugs endpoint (priority 10) should win over question type (priority 5)
      expect(route?.handlerId).toBe('bugAgent');
    });
  });
});
```

### Step 6: FolderWatcher tests

**File:** `code/src/mastra/services/folder-watcher.test.ts`

Test file watching with mocked chokidar.

### Step 7: MessageWriter tests

**File:** `code/src/mastra/services/message-writer.test.ts`

Test file writing with mocked fs.

### Step 8: Tool tests (using mastra-testing-patterns skill)

**File:** `code/src/mastra/tools/message-tools.test.ts`

Use semantic assertions for AI-generated content:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { listEndpointsTool } from './message-tools';

describe('listEndpointsTool', () => {
  it('returns configured endpoints', async () => {
    const result = await listEndpointsTool.execute({});

    expect(result.endpoints).toBeInstanceOf(Array);
    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints[0]).toHaveProperty('id');
    expect(result.endpoints[0]).toHaveProperty('direction');
  });
});
```

### Step 9: Integration test

**File:** `code/src/mastra/services/message-processor.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageProcessor } from './message-processor';
import type { Mastra } from '@mastra/core/mastra';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

describe('MessageProcessor integration', () => {
  const testRoot = '/tmp/test-messages';

  beforeEach(async () => {
    await mkdir(join(testRoot, 'inbox'), { recursive: true });
    await mkdir(join(testRoot, 'outbox'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  // Integration tests here
});
```

## Verification

```bash
cd code
npm test              # Run all tests
npm run test:coverage # Check coverage metrics

# Should see:
# - All tests passing
# - Coverage >80% on src/mastra/services and src/mastra/config
```

## Patterns to Follow

- Use `mastra-testing-patterns` skill for AI component testing
- Mock external dependencies (fs, Mastra, etc.)
- Semantic assertions for non-deterministic outputs
- Arrange-Act-Assert pattern
- Descriptive test names

## Related

- [mastra-testing-patterns skill](../../.claude/skills/mastra-testing-patterns/)
- TASK-005 (manual verification before automated tests)
- TASK-006 (will need tests for persistence layer)
