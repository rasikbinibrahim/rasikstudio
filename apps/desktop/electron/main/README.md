# apps/desktop/electron/main/

Core Electron main process files: application entry point, window management, and the IPC handler registry.

## Key Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `index.ts` | App entry — `app.whenReady()`, window creation, lifecycle hooks |
| `window-manager.ts` | `WindowManager` — creates, tracks, and destroys `BrowserWindow` instances |
| `file-system-service.ts` | Async file read, write, list, watch operations exposed via IPC |
| `lsp-manager.ts` | Language server process lifecycle — start, stop, route JSON-RPC |
| `git-service.ts` | Git CLI subprocess wrapper |
| `pty-manager.ts` | `PtyManager` — node-pty session lifecycle |
| `docker-service.ts` | Docker CLI subprocess wrapper |
| `ipc-registry.ts` | Registers all `ipcMain.handle()` handlers from `ipc/` |

## Rules

- One file per domain (files, git, terminal, docker, browser). No combined "catch-all" handlers.
- All services are class instances, not singleton modules with global state.
- Services are instantiated once in `index.ts` and passed to the IPC registry.
- Every handler validates its input (path traversal checks, type validation) before acting.
