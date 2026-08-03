# Workspace Management — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

A workspace in Rasik Studio is a directory on the user's filesystem that the IDE has been asked to manage. Each workspace has its own settings, chat history, agent memory, RAG index, and Git context. Multiple workspaces can be registered, but only one is active at a time in a given window.

---

## 2. Workspace Lifecycle

```
Open Directory
      │
      ▼
Register Workspace (if new)
  → Create DB record
  → Copy default settings
      │
      ▼
Load Workspace
  → Read .rasik/settings.json (workspace-level overrides)
  → Connect to Git repo (if present)
  → Start file watcher
  → Trigger RAG index (if not indexed or stale)
  → Subscribe WebSocket channel
      │
      ▼
Active Workspace
  → Editor, Terminal, Chat, Agent all scoped to this workspace
      │
      ├── Switch Workspace → graceful close + load new
      │
      └── Close Workspace
            → Flush dirty files (prompt if unsaved)
            → Stop file watcher
            → Unsubscribe WebSocket channel
            → Persist UI state (open tabs, panel sizes)
```

---

## 3. Workspace Settings

Settings are layered. Lower layers override higher ones:

```
Global defaults (shipped with the app)
    ▲ overridden by
User settings (~/.rasik-studio/settings.json)
    ▲ overridden by
Workspace settings (.rasik/settings.json in workspace root)
    ▲ overridden by
Session overrides (in-memory, not persisted; e.g., a quick font size change)
```

### Settings Schema

```json
{
  "editor": {
    "fontSize": 14,
    "fontFamily": "JetBrains Mono, monospace",
    "tabSize": 2,
    "wordWrap": "off",
    "minimap": true,
    "renderWhitespace": "selection",
    "formatOnSave": true
  },
  "ai": {
    "defaultModel": "deepseek-r1:7b",
    "completionModel": "qwen2.5-coder:1.5b",
    "agentModel": "qwen2.5:72b",
    "enableInlineCompletion": true,
    "completionDelay": 300,
    "maxContextFiles": 5
  },
  "workspace": {
    "excludePatterns": ["node_modules", ".git", "dist", "__pycache__"],
    "indexOnOpen": true,
    "defaultBranch": "main"
  },
  "terminal": {
    "shell": "/bin/bash",
    "fontSize": 13,
    "scrollback": 10000
  },
  "theme": "dark-default",
  "keymap": "default"
}
```

---

## 4. File System Abstraction

All file access goes through the `FileService`, which abstracts the IPC layer:

```typescript
// Frontend: services/workspace.service.ts
class WorkspaceService {
  async readFile(relativePath: string): Promise<FileContent>
  async writeFile(relativePath: string, content: string): Promise<void>
  async listDirectory(relativePath: string): Promise<FileEntry[]>
  async moveFile(from: string, to: string): Promise<void>
  async deleteFile(relativePath: string): Promise<void>
  async exists(relativePath: string): Promise<boolean>
  watchDirectory(relativePath: string, handler: FileWatchHandler): Unsubscribe
}
```

The IPC handler on the main process uses Node.js `fs/promises` for all operations. File paths are always validated to be within the workspace root (path traversal prevention).

---

## 5. File Watcher

A file watcher (via `chokidar`) monitors the workspace for changes:

```
chokidar.watch(workspaceRoot, { ignored: excludePatterns })
    │
    ├── add/change/unlink events
    │        │
    │        ├──► Update file tree in UI (via IPC)
    │        ├──► Mark editor tab as stale (if file changed externally)
    │        └──► Queue for RAG re-indexing (debounced 5s)
    │
    └── error events → log, surface to status bar
```

---

## 6. File Explorer

The file explorer in the sidebar renders the workspace as a tree:

- **Virtual rendering:** Only visible nodes are in the DOM (react-virtual).
- **Lazy expansion:** Children are loaded on first expand (not all upfront).
- **File icons:** Determined by extension and name using the `seti` icon pack.
- **Drag and drop:** Files and folders can be moved within the tree.
- **Context menu:** Right-click exposes New File, New Folder, Rename, Delete, Copy Path, Reveal in Finder.
- **Git decorations:** Files show colored indicators for modified (M), added (A), untracked (?), and conflicted (C) states.

---

## 7. Open Editors

Editor state is managed in `editor.store.ts`:

```typescript
interface OpenFile {
  id: string;           // unique ID for this editor instance
  path: string;         // absolute path
  relativePath: string; // relative to workspace root
  content: string;      // current in-memory content
  savedContent: string; // last saved content (for dirty detection)
  language: string;     // detected language
  cursor: { line: number; column: number };
  scrollTop: number;
}
```

- Up to 20 files can be open simultaneously (configurable).
- Closing a dirty file shows a "Save changes?" dialog.
- File content is saved to disk on `Ctrl+S` or on focus loss (if `autoSave` is on).

---

## 8. Workspace-Scoped Data

All of the following are scoped per workspace:

| Data | Storage | Notes |
|---|---|---|
| Chat sessions | PostgreSQL | Deleted with workspace |
| Agent task history | PostgreSQL | Deleted with workspace |
| Code embeddings | PostgreSQL (pgvector) | Deleted with workspace |
| Agent long-term memory | PostgreSQL (pgvector) | Deleted with workspace |
| Terminal history | In-memory / xterm buffer | Not persisted |
| UI state (open tabs, panel sizes) | Electron store | Persisted locally |
| Git state | Git itself | Lives in `.git/` |

---

## 9. Multi-Window Support

Each Electron `BrowserWindow` hosts one active workspace. Users can open multiple windows:

- `File → New Window` → opens a new window with the last-used workspace.
- `File → Open Folder in New Window` → opens the folder in a new window.
- Windows are independent; they each have their own WebSocket connection.
- Changes in one window's file tree are reflected in others via the file watcher IPC events.

---

## 10. Recent Workspaces

The last 10 opened workspaces are stored in Electron's persistent store and shown in:
- The welcome screen on first launch.
- `File → Recent Workspaces` menu.
- The workspace switcher in the title bar.

---

## 11. Workspace Templates

Project templates let users bootstrap a new workspace with a predefined file structure:

```
~/.rasik-studio/templates/
├── fastapi-postgres/
│   ├── template.json    # metadata + variable substitutions
│   ├── app/
│   │   └── main.py
│   └── docker-compose.yml
└── react-typescript/
    ├── template.json
    └── src/
        └── App.tsx
```

Creating from template:
1. User picks template from the New Workspace dialog.
2. Template variables (project name, author, etc.) are substituted.
3. Files are copied to the new workspace root.
4. Git repo is initialized.
5. Workspace is opened.

---

## 12. `.rasik/` Directory

Each workspace can have a `.rasik/` directory for IDE-specific configuration:

```
.rasik/
├── settings.json          # Workspace-level settings
├── ignore                 # Patterns to exclude from AI context (like .gitignore)
├── prompts/               # Saved custom prompts for this workspace
│   └── code-review.md
└── agents/                # Custom agent configurations
    └── deploy.json
```

The `.rasik/` directory should be committed to version control so that team members share the same AI configuration.
