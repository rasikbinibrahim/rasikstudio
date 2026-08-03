# apps/desktop/src/features/file-explorer/

Virtualized file tree panel with file operations, git decorations, and workspace-aware filtering.

## Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `FileExplorer.tsx` | Root panel: toolbar (collapse all, new file/folder, refresh) + tree |
| `FileTree.tsx` | Virtualized tree using `react-virtual` — only renders visible rows |
| `FileTreeNode.tsx` | Single row: icon, name, git decoration badge, context menu |
| `FileContextMenu.tsx` | Right-click menu: open, rename, delete, copy path, reveal in OS |
| `useFileTree.ts` | Hook: loads directory listing via IPC, manages expand/collapse state |
| `file-icons.ts` | Maps file extension to seti icon class name |

## Rules

- The tree uses virtual rendering — do not render all nodes at once regardless of tree size.
- Lazy expand: directory children are fetched on first open only, not pre-loaded.
- File watcher events from the main process trigger incremental tree updates, not full reloads.
- Git decorations (modified, added, untracked) come from `store/git-slice.ts` — not fetched here.
- `.gitignore` and `.rasik/ignore` patterns filter out entries before display.
