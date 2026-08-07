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
| `tests/` | Renderer + Main | E2E tests (Playwright) — unit tests (Vitest) are co-located next to the source they test (`src/**/*.test.ts(x)` for the renderer, `electron/main/**/*.test.ts` for the main process), not here |

## Config Files at This Level

| File | Purpose |
|---|---|
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | TypeScript strict mode configuration |
| `electron.vite.config.ts` | electron-vite build configuration |
| `electron-builder.config.ts` | Cross-platform packaging configuration |
| `tailwind.config.js` | Tailwind CSS with design system token mapping |
| `vitest.config.ts` | Unit test configuration for the renderer (jsdom) project |
| `vitest.workspace.ts` | Fans `vitest run` out across the renderer (jsdom) and main-process (Node) test projects |

## Security Invariants

`contextIsolation: true` and `nodeIntegration: false` must never be changed. All Node.js access from the renderer goes through the contextBridge in `electron/preload/`.
