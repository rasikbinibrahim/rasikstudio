# Plugin System — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The plugin system allows third parties (and users themselves) to extend Rasik Studio without modifying the core application. Plugins run in a sandboxed environment with an explicit, limited API surface. Each plugin declares its required permissions, which the user must approve.

---

## 2. Plugin Types

| Type | Description | Example |
|---|---|---|
| `language` | Syntax highlighting, formatting, LSP integration | Rust support, TOML formatter |
| `theme` | Color themes and icon packs | Dracula theme, Material icons |
| `ai-tool` | Custom tools available to AI agents | Jira integration, custom API caller |
| `sidebar-panel` | Custom panel in the left/right sidebar | Database explorer, API tester |
| `editor-action` | Code action / right-click menu item | "Open in browser", "Copy as cURL" |
| `workspace-provider` | Custom workspace type (e.g., remote SSH) | SSH workspace, container workspace |

---

## 3. Plugin Manifest (`rasik-plugin.json`)

Every plugin must include a manifest at the package root:

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Author Name <author@example.com>",
  "license": "MIT",
  "type": "sidebar-panel",
  "entry": "dist/index.js",
  "permissions": [
    "workspace.read",
    "workspace.write",
    "network.fetch"
  ],
  "contributes": {
    "panels": [
      {
        "id": "my-plugin.panel",
        "title": "My Panel",
        "icon": "assets/icon.svg",
        "position": "left"
      }
    ],
    "commands": [
      {
        "id": "my-plugin.doSomething",
        "title": "My Plugin: Do Something",
        "keybinding": "ctrl+shift+m"
      }
    ]
  },
  "engines": {
    "rasikStudio": ">=1.0.0"
  }
}
```

---

## 4. Plugin API

Plugins interact with the IDE through the Plugin API object injected into their sandbox:

```typescript
interface PluginAPI {
  // Workspace
  workspace: {
    getRoot(): Promise<string>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    listFiles(dir: string): Promise<FileEntry[]>;
    onFileChanged(handler: (event: FileChangeEvent) => void): Disposable;
  };

  // Editor
  editor: {
    getActiveFile(): Promise<OpenFile | null>;
    insertAtCursor(text: string): Promise<void>;
    replaceSelection(text: string): Promise<void>;
    getSelectedText(): Promise<string>;
    showDiff(original: string, modified: string, title: string): Promise<void>;
  };

  // UI
  ui: {
    showMessage(message: string, type: 'info' | 'warning' | 'error'): void;
    showInputBox(options: InputBoxOptions): Promise<string | null>;
    showQuickPick(items: QuickPickItem[]): Promise<QuickPickItem | null>;
    registerPanel(panelId: string, component: React.ComponentType): Disposable;
  };

  // AI
  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<string>;
    stream(messages: Message[], onChunk: (delta: string) => void): Promise<void>;
    embed(text: string): Promise<number[]>;
  };

  // Commands
  commands: {
    register(commandId: string, handler: (...args: unknown[]) => unknown): Disposable;
    execute(commandId: string, ...args: unknown[]): Promise<unknown>;
  };

  // Events
  events: {
    on(event: string, handler: (...args: unknown[]) => void): Disposable;
    emit(event: string, ...args: unknown[]): void;
  };
}
```

---

## 5. Permission System

Plugins must declare required permissions in their manifest. The user is prompted to grant permissions on first install:

| Permission | Access Granted |
|---|---|
| `workspace.read` | Read files in the current workspace |
| `workspace.write` | Write files in the current workspace |
| `workspace.shell` | Execute shell commands (high-risk, shows warning) |
| `network.fetch` | Make HTTP requests to external URLs |
| `network.fetch:own` | Make HTTP requests only to `contributes.allowedHosts` |
| `ai.chat` | Call the AI chat API |
| `settings.read` | Read user settings |
| `settings.write` | Write user settings |
| `editor.read` | Read editor content and selection |
| `editor.write` | Modify editor content |

Denied permissions silently return errors. Plugins cannot request permissions at runtime — only what's declared in the manifest.

---

## 6. Sandbox Model

Plugins run in a sandboxed JavaScript environment:

```
Plugin Code
    │
    ▼
Electron Sandbox (renderer subprocess)
    - contextIsolation: true
    - nodeIntegration: false
    - No access to Node.js APIs
    - No access to Electron APIs
    │
    ▼
Plugin API Bridge (IPC)
    - Only declared permissions are forwarded
    - All calls go through validation
    │
    ▼
Rasik Studio Main Process / Backend
```

UI plugins (sidebar panels) render in an isolated `<iframe>` or a sandboxed React tree with a `postMessage` bridge for API calls. This prevents plugins from injecting arbitrary scripts into the main UI.

---

## 7. Plugin Lifecycle

```
Install
  → validate manifest
  → prompt user for permissions
  → download and verify checksum
  → store in plugins directory

Activate
  → load manifest
  → inject PluginAPI (filtered by permissions)
  → call plugin's activate(api) export
  → register contributed panels, commands, tools

Deactivate
  → call plugin's deactivate() export
  → dispose all Disposables
  → unregister contributed items

Uninstall
  → deactivate
  → remove plugin files
  → remove stored permissions
```

---

## 8. Plugin Entry Point

```typescript
// Plugin entry: dist/index.js

export function activate(api: PluginAPI): void {
  // Register a command
  const disposable = api.commands.register('my-plugin.doSomething', async () => {
    const text = await api.editor.getSelectedText();
    const result = await api.ai.chat([
      { role: 'user', content: `Explain this: ${text}` }
    ]);
    api.ui.showMessage(result, 'info');
  });
  
  // disposables are cleaned up on deactivate automatically
}

export function deactivate(): void {
  // Optional cleanup
}
```

---

## 9. Directory Structure

```
~/.rasik-studio/
└── plugins/
    ├── com.example.my-plugin/
    │   ├── rasik-plugin.json
    │   ├── dist/
    │   │   └── index.js
    │   └── assets/
    │       └── icon.svg
    └── ...
```

Built-in plugins are bundled with the app in `apps/desktop/src/built-in-plugins/`.

---

## 10. Plugin Distribution

**Phase 1 (local install only):**
- Install from local `.zip` file.
- Install from GitHub release URL.

**Phase 2 (marketplace):**
- Hosted plugin registry (JSON manifest index).
- Plugins are signed with author's key.
- Signature verified before install.
- Rating, reviews, install count.

---

## 11. Built-in Plugins

The following are shipped as built-in (non-removable) plugins:

| Plugin | Type | Description |
|---|---|---|
| `core.file-explorer` | sidebar-panel | File tree |
| `core.git` | sidebar-panel | Git integration panel |
| `core.search` | sidebar-panel | Workspace search |
| `core.terminal` | editor-action | Open terminal at path |
| `core.docker` | sidebar-panel | Docker management |
| `core.extensions` | sidebar-panel | Plugin manager UI |

---

## 12. Security Considerations

- Plugin code is not evaluated in the main renderer context.
- Network requests from plugins are proxied through the backend (for logging and allowlist enforcement).
- High-risk permissions (`workspace.shell`) show a prominent warning with full explanation.
- Plugin checksums are stored and verified on each load to detect tampering.
- Plugin sandboxes are killed if they exceed memory (256MB) or CPU (80% for >5s) limits.
