# apps/desktop/src/

React renderer process source code. Runs in Chromium with `contextIsolation: true` and `nodeIntegration: false`. All OS access goes through `window.rasik.*` (the contextBridge) or through the backend HTTP/WebSocket API.

## Directory Map

| Directory | Purpose |
|---|---|
| `components/` | Shared React components (design system + common widgets) |
| `features/` | Self-contained feature modules (editor, chat, git, terminal, ...) |
| `hooks/` | Shared custom React hooks |
| `layout/` | IDE chrome: ActivityBar, panel containers, StatusBar |
| `lib/` | Pure utility functions with zero React dependencies |
| `services/` | API client, WebSocket client, IPC bridge wrapper |
| `store/` | Zustand state management slices |
| `styles/` | Global CSS, CSS custom property tokens, theme files |
| `types/` | Shared TypeScript type declarations |

## Entry Points

- `main.tsx` — mounts the React tree into `#root`
- `App.tsx` — top-level layout composition

## Import Rules

- Features must not import from each other: `features/chat/` cannot import from `features/git/`.
- All features may import from `components/`, `hooks/`, `lib/`, `services/`, `store/`, and `types/`.
- `lib/` must have zero React or browser dependencies — pure TypeScript functions only.
