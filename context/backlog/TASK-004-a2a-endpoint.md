# TASK-004: Set Up A2A Endpoint

## Status: blocked
## Priority: medium
## Size: medium
## Created: 2026-01-19

## Description

Expose the inbox processing agent via A2A (Agent-to-Agent) protocol, allowing external AI agents to communicate with the system through a standardized interface.

## Acceptance Criteria

- [ ] A2A protocol endpoint exposed via Hono
- [ ] Agent card served at well-known URL
- [ ] Message receiving endpoint
- [ ] Task status endpoint
- [ ] Integration with inbox processing agent

## Technical Notes

- A2A protocol spec: agents communicate via JSON-RPC style messages
- Use Mastra's A2A adapter if available
- Endpoint should bridge HTTP requests to folder-based processing

## Dependencies

- TASK-003 (inbox processing agent)

## Blocked By

- TASK-003 must be completed first

## Related

- [domains/protocols/README.md](../domains/protocols/README.md)
- [glossary.md](../glossary.md) - A2A definition
