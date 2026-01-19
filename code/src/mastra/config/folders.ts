import { join } from 'path';
import type { FolderConfig, FolderEndpoint } from '../schemas/folder-config';

export const defaultFolderConfig: FolderConfig = {
  rootPath: '../.agents/messages',
  endpoints: [
    {
      id: 'inbox',
      path: 'inbox',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
    },
    {
      id: 'outbox',
      path: 'outbox',
      pattern: '**/*.md',
      direction: 'outbox',
      requiredFrontmatter: [],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
    },
    {
      id: 'bugs',
      path: 'bugs',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [
        { name: 'severity', type: 'string', required: true, description: 'Bug severity: low, medium, high, critical' },
      ],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
    },
    {
      id: 'feature-requests',
      path: 'feature-requests',
      pattern: '**/*.md',
      direction: 'inbox',
      requiredFrontmatter: [],
      watchMode: 'fsevents',
      pollIntervalMs: 5000,
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
  return join(process.cwd(), config.rootPath, endpoint.path);
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
