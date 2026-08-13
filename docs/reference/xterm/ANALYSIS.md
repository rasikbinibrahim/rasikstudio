# xterm.js — Reference Analysis

**Studied as of:** 2026-08-12. xterm.js is a terminal emulator implemented in the browser/DOM/
canvas, powering VS Code's own integrated terminal (among many others). Directly shipped in this
project, not just studied — `apps/desktop/src/features/terminal/useTerminal.ts` is real,
production integration code (Phase 11).

## 1. Architecture

A `Terminal` object owns a screen buffer (the actual character grid + scrollback) and a pluggable
**renderer** that draws that buffer to a real DOM element — either the default DOM-based renderer
(one `<span>`/text-node structure updated per frame) or the WebGL-accelerated renderer (an addon,
`@xterm/addon-webgl`, drawing to `<canvas>` via WebGL instead). xterm.js itself has no concept of
a real process/PTY — it's purely presentation: `term.write(data)` feeds output into the buffer/
renderer, and `term.onData(handler)` fires whenever the user types, handing the raw bytes to
whoever's driving the actual process. Wiring that "actual process" side up is entirely this
project's own responsibility, done via `node-pty` — see `PTY_INTEGRATION_NOTES.md`.

## 2. Folder Structure

Not directly relevant — consumed as a published package (`@xterm/xterm` + `@xterm/addon-*`), not
vendored source.

## 3. Design Patterns

- **Addon-based extensibility** — core xterm.js ships a minimal terminal; features like WebGL
  rendering, fit-to-container sizing, search, and Unicode-11 grapheme handling are all separate,
  optionally-loaded addon packages (`term.loadAddon(new FitAddon())`). This project loads exactly
  four: `FitAddon`, `SearchAddon`, `Unicode11Addon`, and (best-effort, wrapped in a `try/catch`)
  `WebglAddon` (`useTerminal.ts:44-53`) — see `ADDON_NOTES.md`.
- **Graceful renderer fallback** — `WebglAddon`'s constructor can throw (no WebGL context
  available: headless environment, no GPU, disabled by OS policy) and xterm.js's own design
  expects this: catching the exception and simply not loading the addon leaves the terminal on its
  default DOM renderer, fully functional, just without GPU acceleration. This project's own
  `useTerminal.ts` implements exactly this catch (`useTerminal.ts:48-52`), not a workaround, the
  documented intended usage.
- **Persistent instance across visibility changes, not remount** — the app keeps every terminal
  tab's `Terminal` instance mounted (just `display: none` when its tab isn't active) rather than
  destroying/recreating it — `useTerminal.ts`'s own doc comment states this precisely, and it's
  the same instinct `MonacoEditor.tsx`'s model-reuse pattern applies to editor tabs (see the
  Monaco reference analysis §3): scrollback/state survives a tab switch because nothing was ever
  torn down.

## 4. Dependencies

`@xterm/xterm` (core) + `@xterm/addon-{fit,search,unicode11,webgl}` on the frontend; `node-pty`
(a native Node addon, not part of xterm.js itself — a separate project) on the Electron main-
process side for actually spawning a real shell. `node-pty`'s native-module nature is why
`electron-builder.config.ts`'s `asarUnpack` entry exists and was specifically verified with a real
`--dir` packaging run (`PROGRESS.md`'s Phase 11 entry) — a pure-JS package wouldn't need this.

## 5. Build Process

Standard npm package consumption on the frontend side; `node-pty` requires native compilation
against the exact Electron ABI in use, handled by `@electron/rebuild` (confirmed working across
the Electron 32→39 upgrade, Phase 15 — `node-pty` was automatically recompiled, verified in the
build log) rather than anything xterm.js-specific.

## 6. Features

Full VT100/xterm escape-sequence support (colors, cursor movement, alternate screen buffer for
full-screen programs like `vim`/`htop`); OSC-0/OSC-2 title-change events (this project subscribes
to these for live tab titles, see `PTY_INTEGRATION_NOTES.md`); a link-detection addon
(`@xterm/addon-web-links`, **not currently loaded** — `TASKS.md`'s Phase 11 section already names
clickable URL/path detection as a natural next enhancement, not part of Phase 11's formal
acceptance criteria); Unicode 11 grapheme-cluster-aware rendering (correct handling of emoji/
combining characters, loaded here via `Unicode11Addon`).

## 7. Strengths

- Addon architecture (§3) means this project only pays for what it actually uses — no unused
  renderer/feature code shipped unconditionally.
- The WebGL renderer's graceful fallback (§3) means this project's terminal works identically in
  every environment (including this sandboxed dev container, which has no display server at all —
  `PROGRESS.md`'s Phase 16 entry independently confirms `_electron.launch()` genuinely renders
  here despite that) without any environment-detection code of this project's own.
- Battle-tested VT100 compatibility — running real interactive programs (`vim`, `git`, `python3`)
  correctly is a genuinely hard problem xterm.js has already solved.

## 8. Weaknesses

- No process/PTY concept built in (§1) — real, unavoidable extra integration work every consumer
  (this project included) has to do via a separate library (`node-pty`) and its own IPC plumbing.
- WebGL rendering draws to `<canvas>`, not DOM text — this project's own E2E test suite hit this
  directly: `terminal.spec.ts`'s first draft asserted on `.xterm-screen`'s text content and
  silently read empty strings, since there's no DOM text to read once the WebGL renderer is active
  (`PROGRESS.md`'s Phase 16 entry). Fixed with a real test hook (`window.__rasikTerminals`, see
  `useTerminal.ts:59-66`), not a xterm.js limitation to work around structurally, just a real
  testing-approach adjustment every WebGL-renderer consumer needs to make.
- `node-pty`'s native-module nature (§4) is a real cross-platform build/packaging burden (native
  compilation per platform/Electron-ABI combination) that a pure-JS terminal library wouldn't
  have.

## 9. Reusable Modules

The whole package (+ addons) is used directly as a dependency (see §4), not "reused" in the
copy-source sense.

## 10. Modules That Should Be Rewritten

Not applicable — consumed as published packages.

## 11. License Requirements

See `LICENSE_NOTES.md`.
