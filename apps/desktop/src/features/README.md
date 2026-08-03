# apps/desktop/src/features/

Self-contained feature modules. Each subdirectory owns everything for its feature: components, hooks, and local types. Features are independent — they communicate only through the shared store and services.

## Feature Modules

| Directory | Phase | Description |
|---|---|---|
| `editor/` | 3 | Monaco editor, LSP client, tab management |
| `file-explorer/` | 3 | Virtualized file tree, file operations |
| `command-palette/` | 3 | Global fuzzy command search (Ctrl+Shift+P) |
| `chat/` | 10 | AI chat interface with streaming responses |
| `terminal/` | 11 | xterm.js terminal emulator with multiple tabs |
| `git/` | 12 | Git status, staging, diff, commit, conflict resolution |
| `browser/` | 13 | In-IDE browser panel (WebContentsView) |
| `docker/` | 14 | Docker container management panel |
| `agent/` | 8 | Agent task panel, step viewer, approval gate UI |
| `search/` | 10 | Global search (semantic RAG + text grep) |
| `settings/` | 3 | Settings panel (all 4 layers) |
| `extensions/` | Future | Plugin/extension marketplace panel |

## Cross-Feature Import Rule

Features must not import from each other. If two features need to share data, that data goes in `store/`. If they need to share a UI component, it goes in `components/ui/`. Enforce with ESLint `no-restricted-imports`.
