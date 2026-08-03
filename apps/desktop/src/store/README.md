# apps/desktop/src/store/

Zustand state management. One slice file per major feature domain. All slices are composed into a single store in `index.ts`.

## Slices (to be created across Phases 3–14)

| File | Owns |
|---|---|
| `workspace-slice.ts` | Current workspace path, recently opened workspaces |
| `editor-slice.ts` | Open files, active tab, dirty state, cursor positions |
| `chat-slice.ts` | Chat sessions, messages, streaming state, active model |
| `agent-slice.ts` | Agent tasks, step progress, pending approvals |
| `terminal-slice.ts` | Terminal sessions, active tab, tab titles |
| `git-slice.ts` | Git status (staged, unstaged, untracked), current branch |
| `docker-slice.ts` | Container list and status |
| `ui-slice.ts` | Panel visibility, panel sizes, sidebar active item |
| `settings-slice.ts` | Loaded user and workspace settings |
| `ws-slice.ts` | WebSocket connection status |
| `index.ts` | Composes all slices into one typed store |

## Rules

- Slices use Immer (`immer` middleware) for immutable updates.
- No async logic in slices — side effects live in hooks or services.
- Slices must not import from `features/` — the dependency flows the other way.
- State shape is typed with explicit interfaces, never `any`.
