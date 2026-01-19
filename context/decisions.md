# Architecture Decisions

## Active Decisions

### D001: Use Mastra/Hono for API Framework
**Date:** 2026-01-19
**Status:** Decided

**Context:** Need a framework that easily exposes agents via A2A and tools via MCP.

**Decision:** Use Mastra with Hono backend.

**Rationale:**
- Mastra provides built-in A2A protocol support
- MCP integration for tool/workflow exposure
- TypeScript-first with good DX
- Active development (beta phase)

**Consequences:**
- Dependent on Mastra beta stability
- Must follow Mastra patterns for agents/tools/workflows

---

### D002: Markdown Files with YAML Frontmatter for Messages
**Date:** 2026-01-19
**Status:** Decided

**Context:** Agents need to exchange messages through folder-based inboxes.

**Decision:** Use Markdown files with YAML frontmatter for message format.

**Rationale:**
- Human-readable for debugging
- YAML frontmatter for metadata (response routing, priority, etc.)
- Markdown body for rich content
- Easy to parse programmatically

**Consequences:**
- Need to define frontmatter schema
- File-watching required for real-time processing

---

### D003: Run Inside DevContainer via Supervisord
**Date:** 2026-01-19
**Status:** Decided

**Context:** API needs to run alongside the managed project's development environment.

**Decision:** Deploy as a supervisord-managed service within the devcontainer.

**Rationale:**
- Lifecycle tied to development session
- Access to same filesystem as managed project
- No separate deployment infrastructure needed

**Consequences:**
- Supervisord configuration needed
- Must handle container restart gracefully

---

## Pending Decisions

### D004: Folder Configuration Schema
**Status:** Open

**Question:** How should folder endpoints be configured?

**Options:**
1. JSON/YAML config file
2. Environment variables
3. Code-based configuration

---

## Decision Template

```markdown
### DXXX: [Title]
**Date:** YYYY-MM-DD
**Status:** Proposed | Decided | Superseded

**Context:** [Why is this decision needed?]

**Decision:** [What was decided?]

**Rationale:** [Why this choice?]

**Consequences:** [What follows from this decision?]
```
