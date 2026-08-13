# ADR 0001: Desktop Framework — Electron over Tauri

## Status

Accepted (2026-08-03)

## Context

Rasik Studio needs a cross-platform (Windows/macOS/Linux) desktop shell that can host a Monaco
editor, a real terminal (`node-pty`), a file system, subprocess spawning (`git`, `docker`), and a
Chromium-based renderer for a good editor/UI experience. The two realistic choices were Electron
(Chromium + Node.js) and Tauri (a native WebView + Rust backend).

## Decision

Use Electron.

## Rationale

- **Reference-project parity.** `CLAUDE.md`'s own reference list (VSCodium, Cline) is entirely
  Electron-based — the architecture patterns this project studies (IPC bridge shape, `BrowserWindow`
  lifecycle, native module packaging) transfer directly.
- **`node-pty` and other native Node modules** (terminal, and indirectly anything relying on the
  Node ecosystem for CLI-subprocess-shaped integrations) are first-class in Electron's Node.js
  main process. Tauri's Rust backend would need either FFI into these or a Rust-native
  reimplementation of terminal PTY handling.
- **Monaco Editor** ships and is tested primarily against Electron-style embedding (VS Code
  itself). Tauri's WebView (a per-OS native browser engine — WebView2/WebKit/WebKitGTK) has more
  cross-platform rendering-inconsistency risk for something as layout-sensitive as a code editor.
- **Team/tooling familiarity** with the Node/TypeScript ecosystem end-to-end (main process,
  preload, renderer, build tooling) over introducing a second language (Rust) into the desktop
  layer.

## Alternatives Considered

- **Tauri** — smaller bundle size and lower memory footprint were the real draw, but at the cost
  of exactly the native-module and Monaco-embedding risk above. Revisit only if Electron's
  resource usage becomes a measured, real problem (Phase 18's memory-usage NFR target is the
  place that would surface it).

## Consequences

- Bundle size and baseline memory usage are higher than a Tauri equivalent would be (mitigated by
  lazy-loading Monaco/xterm.js/heavy panels — see `PERFORMANCE_GUIDE.md` §7).
- Every native Node module (`node-pty`) needs `asarUnpack` handling in `electron-builder.config.ts`
  and `@electron/rebuild` against Electron's own Node ABI on every Electron version bump — a real,
  recurring maintenance cost (see the Phase 15 Electron 32→39 upgrade in `CHANGELOG.md`, which hit
  exactly this).
- Electron's own security model (`contextIsolation`, `nodeIntegration: false`, a strict CSP) has
  to be actively maintained — see `SECURITY_GUIDELINES.md`.

## Outcome

Confirmed correct through Phase 16. `node-pty` (terminal), real `git`/`docker` CLI subprocess
spawning, and Monaco all integrated without the friction Tauri would likely have introduced. The
one real cost predicted above materialized exactly once: the Phase 15 Electron 32→39 security
upgrade required `@electron/rebuild` to recompile `node-pty` against the new ABI, which it did
automatically and without incident. Bundle size (the `editor.main-*.js` chunk alone is ~6.3MB,
Monaco's own footprint, unrelated to Electron) has not yet been measured against Phase 18's
formal NFR target as of this writing — that's this ADR's one open thread, tracked in `TASKS.md`
under Phase 18.
