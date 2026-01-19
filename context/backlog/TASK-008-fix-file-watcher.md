# TASK-008: Fix File Watcher for Containerized Environments

## Status: completed
## Priority: high
## Size: small
## Created: 2026-01-19
## Completed: 2026-01-19

## Description

The FolderWatcher service uses chokidar with `watchMode: 'fsevents'`, but fsevents is macOS-specific. In Linux containers (devcontainer), automatic file detection doesn't work. Messages must be manually triggered via API.

## Acceptance Criteria

- [x] File watcher detects new files in Linux containers
- [x] File watcher detects file changes in Linux containers
- [x] File watcher works with both polling and native modes
- [x] Configuration allows switching between modes
- [x] Console logs show "New message:" when files are added

## Solution Summary

### Root Cause

Two issues were identified:

1. **watchMode was set to 'fsevents'** - This mode doesn't work on Linux
2. **Glob patterns don't work reliably with chokidar polling** - The `**/*.md` pattern wasn't triggering events even with polling enabled

### Fixes Applied

**1. Updated `config/folders.ts`:**
- Changed all endpoints from `watchMode: 'fsevents'` to `watchMode: 'poll'`
- Reduced `pollIntervalMs` from 5000ms to 1000ms for faster detection

**2. Updated `services/folder-watcher.ts`:**
- Added `isContainerEnvironment()` function to detect Docker/devcontainer
- Force polling mode in container environments regardless of config
- **Key fix:** Changed from watching glob pattern (`**/*.md`) to watching directory directly
- Added markdown file filter in event handlers instead
- Added `depth: 1` to limit watching to immediate children
- Added logging on `ready` event to confirm watcher status

## Base Directory

All implementation work happens in `/code`.

## Dependencies

- TASK-005 completed (identified the issue)

## Root Cause Analysis

The `watchMode` config option is set to `'fsevents'` which:
1. Is macOS-specific (not available on Linux)
2. Chokidar should fall back to polling, but this may not be happening correctly
3. The `usePolling` option is only set when `watchMode === 'poll'`

## Implementation Plan

### Step 1: Update folder config defaults

**File:** `code/src/mastra/config/folders.ts`

Change default `watchMode` to `'poll'` for cross-platform compatibility:

```typescript
endpoints: [
  {
    id: 'inbox',
    path: 'inbox',
    pattern: '**/*.md',
    direction: 'inbox',
    requiredFrontmatter: [],
    watchMode: 'poll',  // Changed from 'fsevents'
    pollIntervalMs: 1000,  // Reduced from 5000 for faster detection
  },
  // ... same for other endpoints
],
```

### Step 2: Update FolderWatcher to handle modes better

**File:** `code/src/mastra/services/folder-watcher.ts`

```typescript
const watcher = chokidar.watch(pattern, {
  persistent: true,
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
  // Always use polling in containers for reliability
  usePolling: endpoint.watchMode === 'poll' || process.env.CONTAINER === 'true',
  interval: endpoint.pollIntervalMs ?? 1000,
});
```

### Step 3: Add environment detection

Check for container environment and automatically use polling:
- Check `process.env.CONTAINER`
- Check for `/.dockerenv` file
- Check cgroup (Linux container detection)

### Step 4: Test in devcontainer

```bash
cd code
npm run dev

# In another terminal
echo '---
id: watch-test
timestamp: 2026-01-19T00:00:00Z
from: test
subject: Watch test
---
Test' > ../.agents/messages/inbox/watch-test.md

# Should see console output:
# New message: watch-test.md (endpoint: inbox)
```

## Verification

1. Start dev server in devcontainer
2. Create new file in inbox folder
3. Observe console for automatic detection
4. Verify response appears in outbox without manual API call

## Patterns to Follow

- Use feature detection over platform detection where possible
- Provide sensible defaults that work cross-platform
- Allow configuration override via environment variables

## Related

- TASK-005 (identified this issue)
- [services/folder-watcher.ts](../../code/src/mastra/services/folder-watcher.ts)
- [config/folders.ts](../../code/src/mastra/config/folders.ts)
