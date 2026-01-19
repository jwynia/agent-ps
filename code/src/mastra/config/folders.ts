import type { FolderConfig } from '../schemas/folder-config';

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
  ],
  defaultFrontmatter: [
    { name: 'id', type: 'string', required: true },
    { name: 'timestamp', type: 'date', required: true },
    { name: 'from', type: 'string', required: false },
    { name: 'replyTo', type: 'string', required: false },
  ],
};
