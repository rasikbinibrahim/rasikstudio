# Phase 3 — Desktop Application Shell

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 2
**Estimated effort:** 4 weeks

---

## Objective

Build the complete Electron application shell: main process, preload bridge, React renderer with the full IDE layout, Monaco Editor integration, and the design system component library. By the end of this phase, the app launches, displays the IDE chrome, can open and edit files locally (no backend required), and the design system is fully implemented.

## Architecture

**Process model:**

```
Electron Main Process (Node.js)
├── WindowManager       — BrowserWindow lifecycle, multi-window support
├── AppMenuService      — native menu bar
├── ProtocolHandlerService — app:// protocol for renderer assets
├── AutoUpdaterService  — electron-updater lifecycle
├── IpcHandlerRegistry  — all ipcMain.handle() registrations
├── PtyManager          — node-pty (Phase 11, placeholder here)
└── FileSystemService   — IPC-exposed file operations

           ↕  contextBridge (preload.ts)

Renderer Process (React)
├── Layout
│   ├── ActivityBar (48px)
│   ├── LeftSidebar (resizable)
│   │   └── FileExplorer panel
│   ├── EditorArea
│   │   ├── EditorTabBar
│   │   └── MonacoEditor
│   ├── RightSidebar (collapsible, Phase 10+)
│   ├── BottomPanel (collapsible)
│   └── StatusBar (24px)
├── Store (Zustand)
│   ├── workspaceSlice
│   ├── editorSlice
│   ├── uiSlice
│   └── settingsSlice
└── Design System (components/ui/)
```

**IPC bridge (`window.rasik.*`):**
- `window.rasik.files` — read, write, list, watch, delete
- `window.rasik.shell` — openExternal, showItemInFolder
- `window.rasik.app` — getVersion, getPlatform, openWorkspace

**LSP integration architecture:**
- Language servers run as child processes in the Electron main process
- Monaco `MonacoLanguageClient` connects via JSON-RPC over stdin/stdout
- `getWorkerUrl` configured for Monaco web workers in the Electron environment
- Language servers started on demand: first file open of a given language triggers server initialization
- Bundled servers: TypeScript (`typescript-language-server`), Python (`pylsp`), JSON (`vscode-json-languageserver`)

**Monaco setup:**
- Lazy-loaded via dynamic import (not bundled in initial chunk)
- Single editor instance reused across file switches (update model, do not destroy)
- V8 bytecode cache configured via Electron protocol handler
- Web workers served via custom `getWorkerUrl` (prevents web worker load failures in Electron)

## Dependencies

- Phase 2 complete (folder structure and tooling)
- Phase 1 ADR for Electron vs. Tauri finalized

**Actually used** (the shell + design system + command palette + theming built so far): `monaco-editor` (raw package — `@monaco-editor/react` was not needed, Monaco is wrapped directly per `useMonaco.ts`), `react-resizable-panels`, `@radix-ui/react-tooltip`, `@radix-ui/react-dialog`, `@radix-ui/react-context-menu`, `@radix-ui/react-scroll-area`, `lucide-react`, `zustand`, `immer`, `tailwindcss` + `postcss` + `autoprefixer` (v3, PostCSS-based — not `@tailwindcss/vite`, which is the Tailwind v4 Vite-native plugin), `electron-vite`. Turborepo replaced the `concurrently`-based `pnpm dev` script originally planned here (see `PROGRESS.md` Decisions Log).

**Still needed for the deferred remainder of this phase**: `node-pty` (native module, must be in `asarUnpack`) and `monaco-languageclient` (LSP integration) — neither is installed yet; both are tracked in `TASKS.md`.

## Files to Create

**Electron main process:**
- `electron/main/index.ts` — app entry, lifecycle, BrowserWindow creation
- `electron/main/window-manager.ts` — WindowManager service
- `electron/main/app-menu.ts` — AppMenuService
- `electron/main/protocol-handler.ts` — ProtocolHandlerService
- `electron/main/auto-updater.ts` — AutoUpdaterService
- `electron/main/ipc-registry.ts` — all IPC handler registrations
- `electron/main/file-system-service.ts` — file read/write/list/watch
- `electron/main/lsp-manager.ts` — language server process manager
- `electron/preload/index.ts` — contextBridge definitions
- `electron/preload/api.ts` — typed API surface (`window.rasik`)

**React renderer:**
- `src/main.tsx` — React root mount
- `src/App.tsx` — top-level layout composition
- `src/layout/IDELayout.tsx` — ActivityBar + panels grid
- `src/layout/ActivityBar.tsx`
- `src/layout/LeftSidebar.tsx`
- `src/layout/EditorArea.tsx`
- `src/layout/BottomPanel.tsx`
- `src/layout/StatusBar.tsx`
- `src/layout/ResizablePanel.tsx` — wrapper around react-resizable-panels

**Design system:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Tooltip.tsx`
- `src/components/ui/Dialog.tsx`
- `src/components/ui/ScrollArea.tsx`
- `src/components/ui/Tabs.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/ContextMenu.tsx`
- `src/components/ui/index.ts` — barrel export

**Editor:**
- `src/features/editor/MonacoEditor.tsx` — lazy-loaded Monaco wrapper
- `src/features/editor/EditorTabBar.tsx`
- `src/features/editor/EditorTab.tsx`
- `src/features/editor/useMonaco.ts` — Monaco initialization hook
- `src/features/editor/lsp-client.ts` — MonacoLanguageClient setup

**File explorer:**
- `src/features/file-explorer/FileExplorer.tsx`
- `src/features/file-explorer/FileTree.tsx` — virtualized with react-virtual
- `src/features/file-explorer/FileTreeNode.tsx`
- `src/features/file-explorer/useFileTree.ts`

**State:**
- `src/store/workspace-slice.ts`
- `src/store/editor-slice.ts`
- `src/store/ui-slice.ts`
- `src/store/settings-slice.ts`
- `src/store/index.ts`

**Hooks:**
- `src/hooks/useIpc.ts` — typed IPC invocation wrapper
- `src/hooks/useWorkspace.ts`
- `src/hooks/useSettings.ts`

**Services (renderer-side):**
- `src/services/ipc-bridge.ts` — typed wrapper for `window.rasik`

**Styles:**
- `src/styles/global.css` — CSS custom properties (all tokens from `UI_DESIGN_SYSTEM.md §3.1`)
- `src/styles/themes/rasik-dark.json`
- `src/styles/themes/rasik-light.json`

## Files to Modify

- `apps/desktop/package.json` — add all runtime dependencies
- `apps/desktop/vite.config.ts` — configure Monaco worker URLs, lazy chunk splitting
- `apps/desktop/electron-builder.config.ts` — fill in final configuration
- `apps/desktop/tailwind.config.js` — semantic token configuration is already prepared (Phase 2)

## Acceptance Criteria

- [ ] `pnpm dev` launches the Electron app with no errors in the console
- [ ] App window displays the full IDE chrome: ActivityBar, sidebar, editor area, status bar
- [ ] User can open a folder as a workspace via File menu or drag-and-drop
- [ ] File tree renders the opened folder's contents
- [ ] Clicking a file in the tree opens it in Monaco Editor
- [ ] Multiple files can be open simultaneously as tabs
- [ ] Switching tabs correctly restores editor state (scroll position, cursor)
- [ ] Modified file shows unsaved indicator (dot on tab)
- [ ] `Ctrl+S` saves the file to disk
- [ ] `Ctrl+P` opens a quick-open file picker (fuzzy file search)
- [ ] `Ctrl+Shift+P` opens the command palette (even if initially empty)
- [ ] Theme toggles between dark and light (CSS custom properties swap correctly)
- [ ] All design system components render correctly in Storybook or a test page
- [ ] TypeScript language features work in `.ts` files (hover, go-to-definition via LSP)
- [ ] Python language features work in `.py` files
- [ ] Monaco web workers load without errors (check DevTools console)
- [ ] `contextIsolation: true`, `nodeIntegration: false` verified in main.ts
- [ ] CSP header applied and verified via DevTools → Application → Content Security Policy
- [ ] Path traversal check fails gracefully for `../../../etc/passwd` IPC input
- [ ] App window respects `ready-to-show` (no white flash on startup)
- [ ] Memory usage (renderer) stays under 400MB with 10 files open

## Testing Strategy

- **Unit tests (Vitest):** `useMonaco`, `useFileTree`, all design system components (render + interaction)
- **Integration tests (Vitest + msw):** FileExplorer with mocked IPC
- **Manual:** Open a real workspace (e.g., this project's `docs/` directory), edit files, save, verify content on disk
- **Performance:** Measure startup time with `console.time` wrapping `ready-to-show`. Target: < 2s on cold start.
- **Security:** Attempt path traversal via renderer DevTools console calling `window.rasik.files.read('../../../etc/passwd')`. Must throw.

## Estimated Effort

**4 weeks**
- Week 1: Electron main process, preload bridge, IPC registry, WindowManager
- Week 2: React layout, design system component library, Tailwind theme integration
- Week 3: Monaco Editor integration, LSP manager, editor tab management
- Week 4: File explorer, quick-open, command palette skeleton, settings slice, polish
