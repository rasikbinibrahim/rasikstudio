# apps/desktop/electron/preload/

The contextBridge boundary. This is the only code in the entire application that can access both `ipcRenderer` (Node.js) and `window` (renderer). It defines exactly what the renderer is allowed to call.

## Key Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `index.ts` | Entry point — calls `contextBridge.exposeInMainWorld()` |
| `api.ts` | Typed definition of `window.rasik.*` API surface |

## The `window.rasik` API

```
window.rasik.files.*      — file read, write, list, watch
window.rasik.terminal.*   — PTY create, input, resize, kill
window.rasik.git.*        — git operations
window.rasik.docker.*     — docker operations
window.rasik.browser.*    — browser view navigation
window.rasik.settings.*   — settings read/write
window.rasik.shell.*      — openExternal, showItemInFolder
window.rasik.app.*        — version, platform, openWorkspace
```

## Rules

- This file is the security boundary. It must be minimal and explicit.
- Never expose `ipcRenderer` itself — only specific typed wrappers.
- Never expose `require`, `process`, `__dirname`, or any Node.js global.
- The TypeScript types defined here are the contract. Keep them accurate.
