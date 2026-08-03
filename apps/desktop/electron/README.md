# apps/desktop/electron/

Electron main process code. Runs in Node.js — has full OS access including file system, native APIs, child processes, and PTY management.

## Subdirectories

| Directory | Purpose |
|---|---|
| `main/` | Application entry, window management, and domain-specific services |
| `preload/` | The contextBridge boundary — the only code that can talk to both Node.js and the renderer |
| `services/` | Long-lived main-process services (auto-updater, app menu, protocol handler) |

## Critical Rules

- No business logic here. The main process manages OS resources and routes IPC — it does not make AI decisions or implement features.
- Never import renderer-side code (React, Zustand, etc.) into main process files.
- Never expose `ipcRenderer` or `require` to the renderer. All communication goes through `preload/`.
- All user-facing state lives in the renderer. The main process is stateless except for resource lifecycle (open windows, active PTYs).
