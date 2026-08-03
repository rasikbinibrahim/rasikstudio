# apps/desktop/tests/unit/

Vitest unit tests for the React renderer. Directory structure mirrors `src/` exactly.

## Subdirectories

| Directory | Tests For |
|---|---|
| `components/ui/` | Design system component rendering and interaction |
| `features/` | Feature component logic, hooks, and state integration |
| `hooks/` | Shared hook behavior |
| `store/` | Zustand slice action correctness |

## Testing Approach

- Components: `@testing-library/react` for render + interaction tests
- Hooks: `@testing-library/react-hooks` or wrapping in a test component
- Store slices: direct action dispatch + state assertion (no render needed)
- IPC calls: mocked via `vi.mock('../../src/services/ipc-bridge')`
- WebSocket events: mocked via injecting events into `ws-client.ts`

## What NOT to Test Here

- Full page flows → use `tests/e2e/`
- HTTP API responses → mock with `msw` at the service layer
- Electron main process behavior → test in `electron/` integration tests
