# TASK-003: Create Inbox Processing Agent

## Status: blocked
## Priority: high
## Size: large
## Created: 2026-01-19

## Description

Build a Mastra agent that processes incoming messages from the inbox folder. The agent should read messages, extract metadata, and route them appropriately.

## Acceptance Criteria

- [ ] Mastra agent definition with appropriate tools
- [ ] Read and parse inbox messages
- [ ] Extract YAML frontmatter metadata
- [ ] Route messages based on content/metadata
- [ ] Write responses to outbox folder
- [ ] Handle correspondence chains (reply-to tracking)

## Technical Notes

- Use Mastra agent patterns from mastra-hono skill
- Tools needed: read file, write file, parse markdown
- Consider using workflows for complex routing

## Dependencies

- TASK-001 (configuration schema)
- TASK-002 (folder watching service)

## Blocked By

- TASK-002 must be completed first

## Related

- [domains/agents/README.md](../domains/agents/README.md)
