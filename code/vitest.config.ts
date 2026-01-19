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
      exclude: [
        'src/mastra/**/*.test.ts',
        'src/mastra/index.ts',
        // Exclude agent/workflow definitions (hard to unit test)
        'src/mastra/agents/**',
        'src/mastra/workflows/**',
        'src/mastra/scorers/**',
        // Exclude MCP server (integration test territory)
        'src/mastra/mcp/**',
      ],
    },
    // Ensure tests run in isolation
    isolate: true,
    // Pool configuration for Node environment
    pool: 'forks',
  },
});
