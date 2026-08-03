# apps/desktop/electron/main/ipc/

IPC handler files — one file per feature domain. Each file registers `ipcMain.handle()` calls for its domain and validates all inputs before acting.

## Files (to be created in Phase 3)

| File | IPC Channel Prefix | Domain |
|---|---|---|
| `file-handlers.ts` | `files:*` | File read, write, list, watch, delete |
| `terminal-handlers.ts` | `terminal:*` | PTY create, write, resize, kill |
| `git-handlers.ts` | `git:*` | Git status, stage, commit, diff, log |
| `docker-handlers.ts` | `docker:*` | Container list, start, stop, logs |
| `browser-handlers.ts` | `browser:*` | WebContentsView navigation, URL |
| `settings-handlers.ts` | `settings:*` | Read and write user/workspace settings |
| `shell-handlers.ts` | `shell:*` | openExternal, showItemInFolder |

## Security Rules

Every handler must:
1. Validate that file paths are within the workspace root (`resolveWorkspacePath()`).
2. Never execute user-provided strings as shell commands.
3. Return structured error objects — never throw uncaught errors across IPC.
4. Be listed in `preload/index.ts` before it can be called from the renderer.
