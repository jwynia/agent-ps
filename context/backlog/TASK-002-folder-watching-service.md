# TASK-002: Implement Folder-Watching Service

## Status: blocked
## Priority: high
## Size: large
## Created: 2026-01-19

## Description

Create a service that watches configured folders for new/changed Markdown files and triggers processing workflows. This is the core mechanism for the inbox/outbox pattern.

## Acceptance Criteria

- [ ] Watch configured directories for file changes
- [ ] Parse Markdown files with YAML frontmatter
- [ ] Emit events when new messages arrive
- [ ] Handle file creation, modification, deletion
- [ ] Graceful error handling for malformed files

## Technical Notes

- Consider using chokidar or native fs.watch
- Debounce rapid file changes
- Queue events for processing by agents

## Dependencies

- TASK-001 (folder configuration schema)

## Blocked By

- TASK-001 must be completed first

## Related

- [domains/endpoints/README.md](../domains/endpoints/README.md)
