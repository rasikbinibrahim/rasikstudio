# apps/desktop/tests/unit/features/file-explorer/

Unit tests for the file tree and file operations.

Key scenarios to cover:
- Tree renders only visible rows (virtual rendering — confirm DOM node count)
- Clicking a directory node expands it and loads children via IPC
- Clicking a file node dispatches an open-file action to `editor-slice`
- Git decoration badges appear on modified files
- Context menu shows correct options for files vs. directories
- Path traversal attempt in rename input is rejected
