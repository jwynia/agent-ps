# TASK-005: End-to-End Message Flow Verification

## Status: completed
## Priority: high
## Size: small
## Created: 2026-01-19
## Completed: 2026-01-19

## Description

Verify the complete message flow works end-to-end: drop a file in inbox, observe processing, confirm response appears in outbox. This validates the core infrastructure built in TASK-001 through TASK-004.

## Acceptance Criteria

- [x] Start dev server successfully with message processor running
- [x] Drop test message in `.agents/messages/inbox/`
- [x] ~~Observe message being detected and processed (console logs)~~ **PARTIAL** - Manual trigger required (see findings)
- [x] Verify response appears in `.agents/messages/outbox/`
- [x] Response contains proper YAML frontmatter with replyTo reference
- [x] Test bug endpoint: drop message in `.agents/messages/bugs/`
- [x] Test feature-request endpoint: drop message in `.agents/messages/feature-requests/`
- [x] Document any issues found for follow-up tasks

## Findings

### Issue Found: Path Configuration

**Problem:** Tools couldn't find message files. The `rootPath` was relative (`../.agents/messages`) but Mastra bundles and runs from `.mastra/output/`, causing the path to resolve incorrectly.

**Fix Applied:** Updated `config/folders.ts` to use absolute paths:
- Uses `MESSAGES_ROOT` environment variable if set
- Falls back to `/workspaces/agent-ps/.agents/messages` (devcontainer default)
- Removed `process.cwd()` join in `getEndpointPath()`

### Issue Found: File Watcher Not Detecting New Files

**Problem:** The FolderWatcher uses `chokidar` with `watchMode: 'fsevents'`, but fsevents is macOS-specific. Additionally, glob patterns (`**/*.md`) don't work reliably with chokidar polling.

**Resolution:** Fixed in TASK-008:
- Changed default `watchMode` to `'poll'` for cross-platform compatibility
- Changed watcher to monitor directories directly instead of glob patterns
- Added container environment detection to force polling mode
- Automatic file detection now works correctly

### Test Results

| Endpoint | Message | Response Generated | replyTo Correct |
|----------|---------|-------------------|-----------------|
| inbox | test-002.md | ✅ Yes | ✅ Yes |
| bugs | bug-001.md | ✅ Yes | ✅ Yes |
| feature-requests | feature-001.md | ✅ Yes | ✅ Yes |

All responses were contextually appropriate with proper YAML frontmatter.

## Base Directory

All testing happens from `/code`.

## Dependencies

- TASK-001 through TASK-004 completed (all done)

## Implementation Plan

### Step 1: Start the dev server

```bash
cd code
npm run dev
```

Verify console shows:
- "Message processor started, watching endpoints: inbox, bugs, feature-requests"

### Step 2: Create test message for inbox

Create file `.agents/messages/inbox/test-001.md`:

```markdown
---
id: "test-001"
timestamp: "2026-01-19T12:00:00Z"
from: "test-user"
subject: "Test message"
type: "question"
---

Hello, this is a test message to verify the inbox processing works correctly.

Can you confirm receipt of this message?
```

### Step 3: Observe processing

Watch console for:
1. "New message: test-001.md (endpoint: inbox)"
2. "Message test-001.md processed by [handler]"

### Step 4: Verify response

Check `.agents/messages/outbox/` for a new `.md` file with:
- `replyTo: "test-001"` in frontmatter
- Response content from the agent

### Step 5: Test bug endpoint

Create file `.agents/messages/bugs/bug-001.md`:

```markdown
---
id: "bug-001"
timestamp: "2026-01-19T12:00:00Z"
from: "test-user"
subject: "Test bug report"
severity: "medium"
---

This is a test bug report to verify the bugs endpoint works.

Steps to reproduce:
1. Test step

Expected: Working
Actual: Also working (this is a test)
```

### Step 6: Test feature-request endpoint

Create file `.agents/messages/feature-requests/feature-001.md`:

```markdown
---
id: "feature-001"
timestamp: "2026-01-19T12:00:00Z"
from: "test-user"
subject: "Test feature request"
---

This is a test feature request to verify the feature-requests endpoint works.

As a user, I want to verify endpoints work so that I can trust the system.
```

### Step 7: Document findings

Record any issues:
- Processing errors
- Missing responses
- Incorrect routing
- Performance observations

## Verification

All acceptance criteria checked manually during testing.

## Patterns to Follow

- Use proper YAML frontmatter with required fields
- Use `type` field to test different routing paths (question, task, etc.)
- Check both console output and file system

## Related

- TASK-001 through TASK-004 (foundational work)
- [architecture/overview.md](../architecture/overview.md)
