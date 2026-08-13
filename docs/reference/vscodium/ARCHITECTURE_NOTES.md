# VSCodium (Code - OSS) — Architecture Notes

Answers to the "Key Questions" from this folder's `README.md`.

## How does the extension host process isolate extensions from the main IDE?

A dedicated Node.js child process (`extensionHost.ts`), spawned by the main process, running
none of the renderer's DOM/UI code and none of the main process's window-management code — its
whole job is loading and running extension `activate()` functions and proxying their API calls
back to the workbench. Isolation properties:

- **Crash isolation**: if an extension throws an unhandled exception hard enough to crash its
  process, the renderer (and the rest of the IDE) keeps running — the workbench shows an
  "Extension Host terminated unexpectedly" notification and can restart just that process.
- **Hang isolation**: a synchronous, CPU-bound extension operation blocks the extension host's own
  event loop, not the renderer's — the editor stays responsive to keystrokes/scrolling while a
  slow extension command runs.
- **Privilege isolation**: the extension host has full Node.js access (extensions need `fs`,
  `child_process`, etc.) but *not* the same IPC channels the main process exposes to itself —
  extensions reach the rest of the app only through the documented `vscode` API surface, proxied
  over `rpcProtocol.ts`.

This project has no extension/plugin runtime yet (`PLUGIN_SYSTEM.md` documents a real design,
`docs/plugin-authoring/` documents it in full, but nothing loads a third-party plugin today — see
`TASKS.md`'s Phase 17 entry). If a plugin runtime is ever built, this three-process isolation
model — not running plugin code in the renderer, not running it in the main process either — is
the one part of VS Code's architecture worth adopting directly rather than reinventing.

## How does the contextBridge pattern compare to VS Code's IPC?

They solve different problems and both apply here, at different boundaries:

- **`contextBridge`** (Electron's own API, both projects use it) is the **renderer ↔ main**
  boundary: a preload script exposes a fixed, typed, non-Node API surface into the sandboxed
  renderer's `window` object. This project's `electron/preload/index.ts` does exactly this —
  `window.rasik.{files,git,docker,workspace,lsp,...}` — matching VS Code's own
  `contextIsolation: true` + preload-bridge posture.
- **VS Code's `rpcProtocol.ts`** is a *different, additional* boundary this project has no
  equivalent of: **renderer ↔ extension host** (a third process, not the main process). It
  multiplexes many "proxy" objects (one per API namespace, e.g. `MainThreadWorkspace`,
  `ExtHostWorkspace`) over one raw IPC channel, marshalling method calls into serializable
  messages both ways. This project's IPC is simpler by design (one Electron channel per operation,
  e.g. `git:commit`, `docker:start` — see `electron/main/ipc/*-handlers.ts`) because it has only
  two processes talking to each other, not three.

## Which VS Code modules are reusable under MIT license?

Legally, yes — MIT permits copying with attribution (see `LICENSE_NOTES.md`). Practically, no
VS Code module was copied into this project: `vs/base`/`vs/platform` are written against VS
Code's own AMD module system and DI container, both of which would need to be ported before any
of that code would run inside a Vite/ESM build like this project's — the cost of adapting it
exceeds the cost of writing the (much smaller) equivalent this project actually needs. The one
exception is Monaco Editor itself (`vs/editor`), which VS Code's own team ships as a standalone
npm package (`monaco-editor`) specifically so it can be reused without the rest of the workbench —
this project consumes it that way already (see the Monaco reference analysis).

## What makes VS Code's file tree virtualization fast?

VS Code's `List`/`Tree` widgets (`vs/base/browser/ui/list`, `vs/base/browser/ui/tree`) render only
the visible rows into a fixed-height scroll container, recycling DOM row elements as the user
scrolls rather than creating/destroying nodes — the general "virtualized list" technique, hand-
rolled rather than using a third-party library (predating the current ecosystem of virtualization
libraries). This project's own `FileTree.tsx` uses the same technique via `@tanstack/react-virtual`
(a real, off-the-shelf library rather than a hand-rolled one — a reasonable choice given this
project already depends on React, whereas VS Code has no framework to lean on for this). See
`PROGRESS.md`'s Phase 18 entry for the real, measured before/after this fixed in this project
(1265ms → 356ms for 1000 files) — the same class of problem VS Code's own virtualized tree exists
to avoid.
