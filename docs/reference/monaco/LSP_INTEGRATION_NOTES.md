# Monaco Editor — LSP Integration Notes

MonacoLanguageClient setup vs. this project's actual choice, and how real language server
process management works in `apps/desktop/electron/main/lsp-manager.ts`.

## The library `phase-03-desktop-application-shell.md` named: `monaco-languageclient`

`monaco-languageclient` is the standard community bridge between Monaco's provider APIs and the
Language Server Protocol — it wraps `vscode-languageclient`'s protocol logic (originally built
for real VS Code extensions) to work against bare Monaco instead of the full VS Code API surface.
Its *current* major version, however, depends on the `@codingame/monaco-vscode-*` package family —
roughly 30 packages that together re-create a much larger subset of VS Code's own internal API
surface so `vscode-languageclient` can run essentially unmodified against it. Adopting it as
specified would mean replacing this project's plain `monaco-editor` package with that whole
`@codingame/monaco-vscode-*` stack.

## This project's actual choice: a minimal client on `vscode-jsonrpc` directly

Documented as a deliberate architecture deviation (`PROGRESS.md`'s Phase 3 entry, 2026-08-11), not
a shortcut. `lsp-manager.ts` (Electron main process) spawns real language server child processes
—`typescript-language-server`, `vscode-langservers-extracted`'s JSON server (both bundled npm
dependencies, spawned via `process.execPath` so no separate runtime is needed), and Python's
`pylsp`/`uvx` resolved from the host machine (a named, deliberate scope boundary — no bundled
Python runtime ships with this app) — and speaks real LSP over stdio using `vscode-jsonrpc`'s
`createMessageConnection`/`StreamMessageReader`/`StreamMessageWriter` directly (`lsp-manager.ts:1-9`).

`apps/desktop/src/features/editor/lsp-client.ts` (renderer process) then registers real Monaco
providers by hand against that connection: `monaco.languages.registerHoverProvider()` and
`registerDefinitionProvider()` (`lsp-client.ts:166,179`) call `window.rasik.lsp.request()` (the
IPC bridge to the main-process connection) and translate the LSP response shape into Monaco's own
`Hover`/`Definition` return types. Diagnostics arrive as server-initiated `textDocument/
publishDiagnostics` notifications (`lsp-client.ts:205`), translated into `monaco.editor.
setModelMarkers()` calls. Document sync (`didOpen`/`didChange`/`didClose`, `lsp-client.ts:217-242`)
keeps each server's view of open files current.

## Why this was the right call for this project specifically

- **~30 fewer dependencies** and no need to migrate off plain `monaco-editor` (Phase 3's own
  established "wrap Monaco directly" preference, reaffirmed here rather than contradicted).
- **Only 3 providers were actually needed** (hover, go-to-definition, diagnostics — the literal 3
  things `phase-03-desktop-application-shell.md`'s own acceptance criteria ask for) —
  `monaco-languageclient`'s full `vscode-languageclient` compatibility layer supports the entire
  LSP surface (completion, code actions, rename, references, ...), which is more than this
  project's current scope needs; a hand-built client for exactly 3 message types is genuinely
  less code than adopting a library built for the full protocol.
- **Real bugs this project's own testing caught while building the minimal client** (not
  hypothetical — see `CHANGELOG.md`'s LSP entry): a missing `ELECTRON_RUN_AS_NODE` env var
  (spawning a bundled server via `process.execPath` inside Electron's main process launches
  Electron itself without it, not Node), an unhandled-promise-rejection write race in `notify()`,
  and an `asarUnpack` false start (investigated, found unnecessary — Electron's asar transparency
  already covers spawning a bundled server from inside `app.asar`, verified via a real packaged-
  build spawn test). None of these are specific to the minimal-client choice — they'd have been
  real risks under `monaco-languageclient` too, since the underlying "spawn a Node-based language
  server from Electron's main process" mechanics are the same either way.

## What this leaves unbuilt

Completion and code-action providers remain unbuilt — already tracked (`TASKS.md`, multiple
phases' entries) as a natural follow-on, not part of Phase 3's own formal acceptance criteria.
Adding them under the current minimal-client architecture means registering
`registerCompletionItemProvider`/`registerCodeActionProvider` in `lsp-client.ts` and translating
two more LSP message types — a bounded, incremental addition, not a reason to reconsider
`monaco-languageclient` retroactively.
