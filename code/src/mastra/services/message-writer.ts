import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import type { FolderConfig } from '../schemas/folder-config';

export interface WriteMessageOptions {
  endpointId: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  filename?: string;
}

export class MessageWriter {
  constructor(private config: FolderConfig) {}

  async write(options: WriteMessageOptions): Promise<string> {
    const endpoint = this.config.endpoints.find((e) => e.id === options.endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${options.endpointId}`);
    }

    const id = randomUUID();
    const filename = options.filename || `${id}.md`;
    const filePath = join(this.config.rootPath, endpoint.path, filename);

    // Build frontmatter with defaults
    const frontmatter: Record<string, unknown> = {
      id,
      timestamp: new Date().toISOString(),
      ...options.frontmatter,
    };

    // Format as YAML frontmatter + content
    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    const fileContent = `---\n${yamlLines}\n---\n\n${options.content}`;

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, fileContent, 'utf-8');

    return filePath;
  }
}
