# xterm.js — WebGL Setup Notes

`WebglAddon` initialization and fallback to the Canvas/DOM renderer, as actually implemented in
`apps/desktop/src/features/terminal/useTerminal.ts`.

## Setup

```ts
term.open(container)

try {
  term.loadAddon(new WebglAddon())
} catch {
  // WebGL unavailable (headless, no GPU, etc.) — xterm falls back to its default DOM renderer.
}
```

Two ordering details worth being precise about:

1. **`term.open(container)` must run before `loadAddon(new WebglAddon())`** — the addon needs a
   real, already-attached DOM element to acquire a WebGL rendering context against; loading it
   before `open()` would have nothing to attach to.
2. **The `try/catch` is around the addon's *constructor*, not `loadAddon()` itself** — `new
   WebglAddon()` is where WebGL context acquisition actually happens and can throw; this project's
   code catches exactly that failure point.

## What "unavailable" means in practice

`WebglAddon`'s constructor throws when the browser/environment can't provide a WebGL rendering
context — no GPU, GPU blocklisted by Chromium's own driver-bug database, `--disable-gpu` set,
or (relevant to this project specifically) a fully headless environment with no display server at
all. `PROGRESS.md`'s Phase 11 entry names this as one of two acceptance criteria this project
could not verify in its own sandboxed development environment ("WebGL renderer activation is
attempted with a fallback but was never confirmed actually active — no display server exists in
this environment"). The fallback path itself, however, *was* exercised for real in that same
environment (this container has no GPU/display), since every terminal test that ran there
necessarily hit the `catch` branch.

## Why xterm.js's WebGL renderer matters, and why the fallback is safe either way

The WebGL renderer draws terminal output to a `<canvas>` via GPU-accelerated draw calls instead of
DOM text-node updates — materially faster for high-throughput output (e.g. `cat` on a large file,
a build tool's verbose logs) where the default DOM renderer would otherwise create/update many DOM
nodes per frame. The fallback DOM renderer is fully functional, just without that GPU-accelerated
throughput ceiling — this project's terminal works correctly either way, which is why the
`try/catch` swallowing the failure silently (no error surfaced to the user) is the right behavior,
not a gap: there is no user-facing degradation to report, only a performance characteristic that
differs invisibly.

## The real, non-obvious consequence for testing

Because the WebGL renderer draws to `<canvas>`, not DOM text, `document.querySelector('.xterm-
screen').textContent` (or any DOM-text-based assertion) reads empty once the WebGL renderer is
active — a real bug this project's own E2E suite hit directly (`terminal.spec.ts`'s first draft,
`PROGRESS.md`'s Phase 16 entry) before being fixed. See `apps/desktop/tests/e2e/fixtures/
electron-app.ts`'s `readTerminalText()` and `useTerminal.ts:59-66`'s `window.__rasikTerminals`
test hook for the real fix: read `term.buffer.active` directly (the same real screen-buffer object
xterm.js's own renderer — WebGL or DOM — reads from to draw), not the DOM.
