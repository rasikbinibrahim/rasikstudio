# Frontend Architecture — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The frontend is an Electron application with a React renderer. The main process handles OS-level concerns (file system, native menus, PTY, IPC), while the renderer process delivers the full IDE UI using React, Monaco Editor, and xterm.js. A strict contextBridge boundary separates them for security.

---

## 2. Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  (Node.js — full OS access)                                 │
│                                                             │
│  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐  │
│  │  BrowserWin  │  │  node-pty  │  │   IPC Handlers     │  │
│  │  Management  │  │  (PTY)     │  │  (file, shell,     │  │
│  │              │  │            │  │   git, settings)   │  │
│  └──────────────┘  └────────────┘  └────────────────────┘  │
│                          │                                  │
│              ┌───────────▼──────────────┐                  │
│              │      contextBridge        │  (preload.ts)   │
│              │  exposes safe API only    │                  │
│              └───────────┬──────────────┘                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ IPC
┌──────────────────────────▼──────────────────────────────────┐
│                   Renderer Process                           │
│  (Chromium — contextIsolation: true, nodeIntegration: false)│
│                                                             │
│  React 18 + TypeScript + Vite                               │
│                                                             │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │   Monaco   │ │   xterm.js   │ │    AI Chat Panel     │  │
│  │   Editor   │ │   Terminal   │ │    Browser Panel     │  │
│  └────────────┘ └──────────────┘ └──────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Zustand State Stores                    │   │
│  │  workspace · editor · chat · agent · terminal · ui  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Service Layer (API + WebSocket)             │   │
│  │  apiClient · wsClient · ipcClient                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

The full, authoritative `apps/desktop/` tree lives in `FOLDER_STRUCTURE.md`; the module-by-module breakdown (which file does what) is in `PROJECT_STRUCTURE.md §4`. In summary, the renderer is organized around **features**, not component type: each feature under `src/features/<name>/` (`editor/`, `file-explorer/`, `chat/`, `agent/`, `git/`, `terminal/`, `browser/`, `docker/`, `search/`, `settings/`, `command-palette/`, `extensions/`) owns its own components and hooks, and features never import from one another — only feature-agnostic design-system primitives live in `src/components/ui/`. State (`src/store/`), cross-feature hooks (`src/hooks/`), and the three external-communication services (`src/services/api-client.ts`, `ws-client.ts`, `ipc-bridge.ts`) are shared across every feature. The Electron main process mirrors this under `electron/main/`, `electron/preload/`, and `electron/services/`.

---

## 4. Layout System

The IDE uses a panel-based layout with resizable splits:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Title Bar (custom — drag region, traffic lights, workspace name)   │
├────────┬────────────────────────────────────────┬───────────────────┤
│Activity│  Editor Area                           │  Right Sidebar    │
│  Bar   │  ┌───────────────────────────────────┐ │  (AI Chat or      │
│(icons) │  │  Tabs                             │ │   Agent Panel)    │
│        │  ├───────────────────────────────────┤ │                   │
│  Left  │  │                                   │ │                   │
│Sidebar │  │  Monaco Editor                    │ │                   │
│(File   │  │                                   │ │                   │
│Explorer│  │                                   │ │                   │
│ Git    │  │                                   │ │                   │
│ Search │  │                                   │ │                   │
│ Exts)  │  └───────────────────────────────────┘ │                   │
│        ├────────────────────────────────────────┤                   │
│        │  Terminal Panel (collapsible)           │                   │
└────────┴────────────────────────────────────────┴───────────────────┘
│  Status Bar (branch, errors, AI status, language, line:col)         │
└─────────────────────────────────────────────────────────────────────┘
```

Panel sizing is stored in `ui.store.ts` and persisted to user settings.

---

## 5. State Management

Zustand is used for global state. Each slice is defined independently:

```typescript
// store/editor.store.ts
interface EditorStore {
  openFiles: OpenFile[];
  activeFileId: string | null;
  dirtyFileIds: Set<string>;
  openFile: (path: string) => Promise<void>;
  closeFile: (id: string) => void;
  markDirty: (id: string) => void;
  saveFile: (id: string) => Promise<void>;
}
```

Rules:
- Stores hold UI state and derived data only — source of truth is backend/disk.
- Async actions are `async` methods on the store (no Redux-style middleware needed).
- Stores can subscribe to WebSocket events via the `ws.client.ts` service.

---

## 6. IPC Bridge

The preload script exposes a minimal, typed API to the renderer:

```typescript
// preload.ts
contextBridge.exposeInMainWorld('rasik', {
  files: {
    read: (path: string) => ipcRenderer.invoke('files:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('files:write', path, content),
    list: (dir: string) => ipcRenderer.invoke('files:list', dir),
    watch: (dir: string, cb: (event: FileEvent) => void) => { ... },
  },
  shell: {
    createSession: () => ipcRenderer.invoke('shell:create'),
    write: (id: string, data: string) => ipcRenderer.send('shell:write', id, data),
    onData: (id: string, cb: (data: string) => void) => { ... },
  },
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
    commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
});
```

The renderer accesses this as `window.rasik.*`.

---

## 7. Monaco Editor Integration

Monaco is loaded asynchronously to avoid blocking the initial render:

```typescript
// lib/monaco.config.ts
async function initMonaco(): Promise<void> {
  const monaco = await import('monaco-editor');
  configureThemes(monaco);
  configureLanguages(monaco);
  registerCompletionProvider(monaco);  // hooks into AI backend
  registerHoverProvider(monaco);
  registerCodeActions(monaco);         // AI quick-fix actions
}
```

Editor instances are stored by file ID and reused to preserve undo history.

---

## 8. WebSocket Integration

A singleton WebSocket client manages the connection:

```typescript
// services/ws.client.ts
class WSClient {
  connect(workspaceId: string): void;
  disconnect(): void;
  on<T>(eventType: string, handler: (payload: T) => void): () => void;  // returns unsubscribe
  off(eventType: string, handler: Function): void;
}
```

React components subscribe via hooks:

```typescript
// hooks/useWebSocket.ts
function useWebSocketEvent<T>(eventType: string, handler: (payload: T) => void): void {
  useEffect(() => {
    return wsClient.on(eventType, handler);  // cleanup on unmount
  }, [eventType, handler]);
}
```

---

## 9. Build Configuration

```
apps/desktop/
├── vite.renderer.config.ts    # Renderer bundle (React)
├── vite.main.config.ts        # Main process bundle
├── vite.preload.config.ts     # Preload bundle
└── electron-builder.config.ts # Packaging (Windows / macOS / Linux)
```

Key Vite settings:
- Target: `ESNext` for renderer, `Node18` for main/preload.
- Code splitting: manual chunks for Monaco (large), xterm.js, React.
- Hot reload in development via `electron-vite`.

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Monaco bundle size (~5MB) | Lazy-loaded after shell renders |
| File tree with 10K+ files | Virtual list (react-virtual); lazy expand |
| Terminal rendering | xterm.js WebGL renderer |
| Chat history with long messages | Virtualized message list |
| Large file opening | Stream file content in chunks; warn over 5MB |

---

## 11. Accessibility

- All interactive elements have `aria-*` labels.
- Full keyboard navigation for all panels.
- Focus trap in modals.
- Color contrast: WCAG 2.1 AA minimum.
- Screen reader tested with NVDA (Windows) and VoiceOver (macOS).
