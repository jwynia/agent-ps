# TASK-001: Define Folder Endpoint Configuration Schema

## Status: ready
## Priority: high
## Size: medium
## Created: 2026-01-19

## Description

Define the configuration schema for folder endpoints that agents will use to exchange messages. This schema determines how folders are mapped to endpoints and what metadata is required.

## Acceptance Criteria

- [ ] TypeScript interface for folder endpoint configuration
- [ ] Zod schema for runtime validation
- [ ] Support for multiple folders (inbox, outbox, custom folders like /bugs, /feature-requests)
- [ ] Configuration for file patterns (e.g., *.md)
- [ ] Optional metadata requirements (YAML frontmatter fields)

## Technical Notes

- Use Mastra configuration patterns
- Schema should be extensible for future endpoint types
- Consider watching modes (poll vs filesystem events)

## Dependencies

None - this is a foundational task.

## Related

- [architecture/overview.md](../architecture/overview.md)
- [domains/endpoints/README.md](../domains/endpoints/README.md)
