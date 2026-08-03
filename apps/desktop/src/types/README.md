# apps/desktop/src/types/

Shared TypeScript type declarations used across multiple parts of the renderer. Types that are local to a single feature stay in that feature's directory.

## Files (to be created as needed)

| File | Contents |
|---|---|
| `ipc.ts` | Types for all `window.rasik.*` IPC channel payloads |
| `ws-events.ts` | Discriminated union types for all WebSocket event types |
| `workspace.ts` | `Workspace`, `OpenFile`, `WorkspaceSettings` |
| `ai.ts` | `ChatMessage`, `ChatSession`, `StreamChunk`, `ModelInfo` |
| `agent.ts` | `AgentTask`, `AgentStep`, `ToolCall`, `ApprovalRequest` |
| `git.ts` | `GitStatus`, `GitFile`, `GitCommit`, `GitBranch` |
| `theme.ts` | `Theme`, `ThemeType`, token name string literals |
| `global.d.ts` | `declare const window.rasik: RasikAPI` — global type augmentation |

## Source of Truth

`ws-events.ts` and API response types must match the backend's Pydantic schemas. These types are generated from the OpenAPI schema by `packages/desktop-types/` — do not write them by hand here. Only truly desktop-only types (IPC payloads, local UI state shapes) belong in this directory.
