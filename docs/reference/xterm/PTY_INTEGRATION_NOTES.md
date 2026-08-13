# xterm.js — PTY Integration Notes

How xterm.js pairs with `node-pty` for PTY data I/O, as actually implemented across
`apps/desktop/electron/main/pty-manager.ts` (main process) and
`apps/desktop/src/features/terminal/useTerminal.ts` (renderer process).

## The two halves, and why they're in different processes

xterm.js (§1 of `ANALYSIS.md`) has no process/PTY concept — it's pure terminal *presentation*,
and it runs in the renderer process (it's a DOM/canvas-drawing library, needs a real browser
environment). Spawning and owning an actual pseudo-terminal process (a real shell, or in this
project's Docker-panel case, `docker exec`) requires OS-level PTY APIs that only exist in a
Node.js environment with native-module access — the Electron **main** process, not the sandboxed
renderer. `node-pty` (a separate project from xterm.js, native Node addon) is what bridges that
gap: `PtyManager` (`pty-manager.ts`) owns real `IPty` instances, one per terminal session, entirely
in the main process.

## The data path, both directions

**Renderer → main (user input):**

```ts
term.onData((data) => {
  window.rasik.terminal.write(terminalId, data)
})
```

Every keystroke/paste xterm.js captures is forwarded verbatim over the `contextBridge`-exposed
`window.rasik.terminal.write()` call to an IPC handler that calls `PtyManager.write(id, data)` →
`session.pty.write(data)` — the real PTY's stdin.

**Main → renderer (process output):**

```ts
// pty-manager.ts
ptyProcess.onData((data) => {
  broadcast(`terminal:data:${id}`, data)
})

// useTerminal.ts
const unsubscribeData = window.rasik.terminal.onData(terminalId, (data) => {
  term.write(data)
})
```

`node-pty`'s own `onData` callback fires with raw output bytes from the real process (stdout+
stderr merged, as a real PTY does); `PtyManager` broadcasts it over a **per-session IPC channel**
(`terminal:data:${id}`, one channel per terminal instance, not one shared channel with an id field
in the payload) to every open `BrowserWindow`, and `useTerminal.ts` feeds it straight into
`term.write(data)` — xterm.js itself parses the VT100/xterm escape sequences embedded in that raw
stream and updates its screen buffer accordingly. Neither side does any escape-sequence
interpretation of its own; that's entirely xterm.js's job on the way in.

## Resize, a real two-step handshake

Covered fully in `ADDON_NOTES.md`'s `FitAddon` section: `fitAddon.fit()` (xterm.js resizes its own
row/column model to its container) must be paired with `window.rasik.terminal.resize(terminalId,
term.cols, term.rows)` → `PtyManager.resize()` → `session.pty.resize(cols, rows)` (the real PTY is
told its new dimensions) — both xterm.js and the real spawned process need to agree on terminal
size, or `vim`/`htop`-style full-screen programs will render incorrectly.

## Session lifecycle and exit

`PtyManager.create()` (`pty-manager.ts:40`) spawns with `node-pty`'s own PTY emulation (`name:
'xterm-256color'`, matching `useTerminal.ts`'s own `Terminal` constructor options — both sides
must agree on the terminal type string for escape-sequence compatibility) and registers an
`onExit` handler (`pty-manager.ts:65`) that broadcasts `terminal:exit:${id}` — `useTerminal.ts`
subscribes to this and calls `markTerminalExited(terminalId)` (a store action, not directly tied
to xterm.js itself — the UI decides how to represent an exited terminal tab, xterm.js has no
opinion on "the process behind me died").

## The command/args override — reused for Docker's "open shell"

`PtySessionOptions.command`/`.args` (`pty-manager.ts:5-13`) is an optional override that replaces
the default-shell spawn entirely — `docker-handlers.ts`'s "open shell in container" feature
(Phase 14) spawns `docker exec -it {id} /bin/sh` through this same override rather than building a
second terminal implementation, per that option's own doc comment. From xterm.js's perspective
this is invisible — it's still just a PTY session sending it data, whether that PTY is a login
shell or a `docker exec` process makes no difference to the presentation layer at all, which is
exactly the point of the abstraction boundary being where it is (xterm.js: presentation only;
`node-pty`/`PtyManager`: process ownership, whatever the process is).

## Known limitation, already tracked

`PtyManager.broadcast()`/`DockerLogStreamManager`'s identical helper both send to *every* open
`BrowserWindow` (`pty-manager.ts:30-34`'s own comment) — harmless with one window, will
double-deliver output once multi-window support exists (`TASKS.md`, multiple entries). Not a
xterm.js concern; entirely this project's own IPC-broadcast design to revisit when that's built.
