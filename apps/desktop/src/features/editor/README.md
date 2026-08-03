# apps/desktop/src/features/editor/

Monaco Editor integration: lazy loading, web worker setup, LSP client, multi-file tab management, and diff viewer.

## Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `MonacoEditor.tsx` | Lazy-loaded Monaco wrapper; single editor instance reused across files |
| `EditorTabBar.tsx` | Tab strip with close, dirty indicator, reorder |
| `EditorTab.tsx` | Single tab component |
| `DiffViewer.tsx` | Monaco diff editor for git and agent patch review |
| `useMonaco.ts` | Hook managing Monaco initialization, theme registration, worker URLs |
| `lsp-client.ts` | `MonacoLanguageClient` setup — connects Monaco to language server processes |
| `language-config.ts` | Map from file extension to Monaco language ID and LSP server |

## Critical Setup Notes

- Monaco must be lazy-loaded (`await import('monaco-editor')`) — never statically imported.
- Web workers require a custom `getWorkerUrl` function configured in `vite.config.ts`. Without this, TypeScript language services block the main thread on large files.
- The editor instance is created once and reused — switching files calls `editor.setModel(model)`, not `editor.dispose()` then recreate.
- LSP client connects to language server processes running in the Electron main process via `electron/main/lsp-manager.ts`.
