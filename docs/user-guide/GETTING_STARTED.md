# Getting Started

## Opening a workspace

**File → Open Folder…** (or the command palette's "Open Folder…" command) opens a native folder
picker. You can also drag a folder from your OS file manager directly onto the window. Either way,
the file tree on the left populates and you're ready to work — no account, no sign-in, no
workspace "creation" step required (this app is local-first; see `SETTINGS.md`/root
`AUTHENTICATION.md` for what actually requires signing in).

## The layout

- **Activity Bar** (far left, 48px) — switches the sidebar between Explorer, AI Chat, Agent
  Tasks, Source Control, Browser, and Docker.
- **Sidebar** — whichever view is active.
- **Editor area** — Monaco Editor, tabbed. `Ctrl+S` saves; a dot on a tab means unsaved changes.
- **Bottom panel** — the terminal (`Ctrl+\`` to toggle; starts a real shell on first open).
- **Status bar** — workspace name, current git branch (click to open Source Control), cursor
  position, sign-in state.

## Opening and editing a file

Click any file in the tree, or `Ctrl+P` for fuzzy quick-open by filename. Multiple files stay
open as tabs; switching tabs preserves scroll position and cursor location per file. For
TypeScript/JavaScript/Python/JSON files, hovering a symbol shows real type/documentation info,
and go-to-definition works — both backed by a real language server (not AI — plain language
tooling) Rasik Studio starts on demand for your workspace.

## Your first AI chat

`Ctrl+Shift+C` opens AI Chat and focuses the input. **This needs local Ollama running, or a
cloud provider API key configured in Settings** — without either, sending a message will fail
with a real error, not a fabricated response. See `AI_FEATURES.md`.

## Command palette and quick-open

`Ctrl+P` — quick-open a file by name. `Ctrl+Shift+P` — the same overlay, in command mode (type
`>` or the shortcut switches automatically), listing every registered command. Both share one
component; typing `>` as the first character is what distinguishes them if you're already in the
`Ctrl+P` view and want to switch to commands.

## Next steps

- `AI_FEATURES.md` — chat, agent tasks
- `GIT_INTEGRATION.md` — staging, committing, AI commit messages
- `TERMINAL.md` — shell tabs
- `KEYBOARD_SHORTCUTS.md` — the full list
