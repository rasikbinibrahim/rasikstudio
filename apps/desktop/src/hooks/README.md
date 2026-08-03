# apps/desktop/src/hooks/

Shared custom React hooks used by two or more features. Hooks that are used only within a single feature live in `features/<feature>/` instead.

## Files (to be created across Phases 3–12)

| File | Purpose |
|---|---|
| `useIpc.ts` | Typed wrapper for `window.rasik.*` IPC invocation |
| `useWebSocket.ts` | Subscribe to typed WebSocket events from `services/ws-client.ts` |
| `useWorkspace.ts` | Current workspace metadata and open/close operations |
| `useSettings.ts` | Read and write user/workspace settings |
| `useTheme.ts` | Current theme, toggle between dark/light |
| `useKeyBinding.ts` | Register and respond to keyboard shortcuts |
| `useDebounce.ts` | Debounce a value by N milliseconds |

## Rules

- Hooks must be pure in the React sense: same inputs produce same outputs.
- A hook must not directly call `window.rasik.*` — use `useIpc` as the single typed wrapper.
- No hook in this directory may import from `features/`.
