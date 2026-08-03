# apps/desktop/

The Rasik Studio desktop application — an Electron + React IDE.

## Process Architecture

```
Electron Main Process (Node.js)   ←→   contextBridge (preload/)
        ↕ IPC
Renderer Process (React + Monaco)       ←→   Backend (HTTP + WebSocket)
```

## Key Directories

| Directory | Process | Purpose |
|---|---|---|
| `electron/` | Main | Node.js code: window management, IPC, PTY, file system |
| `src/` | Renderer | React UI: editor, panels, state, design system |
| `build/` | Build | Static assets for electron-builder packaging |
| `tests/` | Both | Unit tests (Vitest) and E2E tests (Playwright) |

## Config Files at This Level

| File | Purpose |
|---|---|
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | TypeScript strict mode configuration |
| `electron.vite.config.ts` | electron-vite build configuration |
| `electron-builder.config.ts` | Cross-platform packaging configuration |
| `tailwind.config.js` | Tailwind CSS with design system token mapping |
| `vitest.config.ts` | Unit test configuration |

## Security Invariants

`contextIsolation: true` and `nodeIntegration: false` must never be changed. All Node.js access from the renderer goes through the contextBridge in `electron/preload/`.
