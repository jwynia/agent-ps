import { join } from 'path';
import type { FolderConfig, FolderEndpoint } from '../schemas/folder-config';

/**
 * Get the root path for message folders.
 * Mastra bundles and runs from .mastra/output/, so we need an absolute path.
 * Uses MESSAGES_ROOT env var, or defaults based on known project structure.
 */
function getMessagesRoot(): string {
  if (process.env.MESSAGES_ROOT) {
    return process.env.MESSAGES_ROOT;
  }
  // In devcontainer, workspace is at /workspaces/agent-ps
  // This is a reasonable default for development
  const workspaceRoot = process.env.WORKSPACE_ROOT ?? '/workspaces/agent-ps';
  return join(workspaceRoot, '.agents/messages');
}

export const defaultFolderConfig: FolderConfig = {
  rootPath: getMessagesRoot(),
  endpoints: [
    {
      id: 'inbox',
      path: 'inbox',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [],
      watchMode: 'poll',  // Use polling for cross-platform compatibility
      pollIntervalMs: 1000,  // 1 second for responsive detection
    },
    {
      id: 'outbox',
      path: 'outbox',
      pattern: '**/*.md',
      direction: 'outbox',
      requiredFrontmatter: [],
      watchMode: 'poll',
      pollIntervalMs: 1000,
    },
    {
      id: 'bugs',
      path: 'bugs',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [
        { name: 'severity', type: 'string', required: true, description: 'Bug severity: low, medium, high, critical' },
      ],
      watchMode: 'poll',
      pollIntervalMs: 1000,
    },
    {
      id: 'feature-requests',
      path: 'feature-requests',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [],
      watchMode: 'poll',
      pollIntervalMs: 1000,
    },
  ],
  defaultFrontmatter: [
    { name: 'id', type: 'string', required: true },
    { name: 'timestamp', type: 'date', required: true },
    { name: 'from', type: 'string', required: false },
    { name: 'replyTo', type: 'string', required: false },
  ],
};

/**
 * Get an endpoint by ID from the config
 */
export function getEndpoint(endpointId: string, config: FolderConfig = defaultFolderConfig): FolderEndpoint | undefined {
  return config.endpoints.find(e => e.id === endpointId);
}

/**
 * Get the full filesystem path for an endpoint
 */
export function getEndpointPath(endpointId: string, config: FolderConfig = defaultFolderConfig): string {
  const endpoint = getEndpoint(endpointId, config);
  if (!endpoint) {
    throw new Error(`Endpoint not found: ${endpointId}`);
  }
  // rootPath is now absolute, so no need to join with process.cwd()
  return join(config.rootPath, endpoint.path);
}

/**
 * List all available endpoints
 */
export function listEndpoints(config: FolderConfig = defaultFolderConfig): FolderEndpoint[] {
  return config.endpoints;
}

/**
 * Get endpoints that accept incoming messages (inbox or bidirectional)
 */
export function getInboxEndpoints(config: FolderConfig = defaultFolderConfig): FolderEndpoint[] {
  return config.endpoints.filter(e => e.direction === 'inbox' || e.direction === 'bidirectional');
}

/**
 * Get the default outbox endpoint for responses
 */
export function getDefaultOutboxEndpoint(config: FolderConfig = defaultFolderConfig): FolderEndpoint | undefined {
  return config.endpoints.find(e => e.direction === 'outbox');
}
