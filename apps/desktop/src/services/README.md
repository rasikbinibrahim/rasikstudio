# apps/desktop/src/services/

Renderer-side client services: the HTTP API client, the WebSocket client, and the typed IPC bridge. These are the only three ways the renderer communicates with the outside world.

## Files (to be created in Phase 3 and Phase 7)

| File | Purpose |
|---|---|
| `api-client.ts` | Typed HTTP client for the FastAPI backend (`/api/v1/*`) |
| `ws-client.ts` | Singleton WebSocket client — connects, reconnects, dispatches typed events |
| `ipc-bridge.ts` | Typed wrapper around `window.rasik.*` (the contextBridge API) |

## Design Rules

- `api-client.ts` handles authentication headers, base URL configuration, and error normalization.
- `ws-client.ts` is a singleton: one connection per workspace, shared across all features.
- `ipc-bridge.ts` is a thin wrapper — it maps `window.rasik.*` to TypeScript-safe function calls.
- No feature component should call `window.rasik.*` directly — always go through `ipc-bridge.ts`.
- No feature component should call `fetch()` directly — always go through `api-client.ts`.
