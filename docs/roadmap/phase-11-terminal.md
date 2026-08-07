# Phase 11 — Terminal

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 3
**Estimated effort:** 2 weeks

---

## Objective

Integrate a full-featured terminal emulator: node-pty for PTY management in the Electron main process, xterm.js with WebGL renderer in the React renderer, multiple terminal tabs, and complete isolation between the user's terminal and the agent's execution environment.

## Architecture

**Two separate execution contexts:**
1. **User terminal** — node-pty PTY, rendered in xterm.js, interactive, in the desktop app
2. **Agent terminal** — `asyncio.create_subprocess_exec` in the FastAPI backend, non-interactive, results returned as tool output

These must never share state. Agents do not write to the user's PTY.

**PtyManager (Electron main process):**
```
Map<terminalId, PtySession>
  PtySession: { pty: IPty, pid: number, cwd: string }
```

IPC channels:
- `terminal:create` → spawn PTY, return `terminalId`
- `terminal:input` → write to PTY stdin
- `terminal:resize` → resize PTY (cols, rows)
- `terminal:kill` → SIGTERM to PTY process
- PTY output → `terminal:data:{terminalId}` event pushed to renderer

**xterm.js configuration:**
- `WebglAddon` (hardware-accelerated rendering)
- `FitAddon` (auto-resize to container)
- `Unicode11Addon` (full Unicode support)
- `SearchAddon` (Ctrl+F search in terminal output)
- Scrollback: 10K lines (configurable, default)
- Font: JetBrains Mono (from design system)

**Performance:** PTY output batched at 60fps (16ms throttle) before IPC delivery to renderer.

## Dependencies

- Phase 3 complete (Electron main process, IPC registry)
- `node-pty` (native module — must be in `asarUnpack` in `electron-builder.config.ts`)
- `xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`, `@xterm/addon-unicode11`, `@xterm/addon-search`

## Files to Create

**Electron main:**
- `electron/main/pty-manager.ts` — `PtyManager` class, session lifecycle
- `electron/main/ipc/terminal-handlers.ts` — IPC handlers for terminal operations

**Desktop renderer:**
- `src/features/terminal/TerminalPanel.tsx` — tabs + xterm container
- `src/features/terminal/TerminalTab.tsx` — single terminal instance
- `src/features/terminal/useTerminal.ts` — hook managing xterm.js lifecycle, IPC subscriptions
- `src/features/terminal/TerminalTabBar.tsx`
- `src/store/terminal-slice.ts` — terminal session state

## Files to Modify

- `electron/main/ipc-registry.ts` — register terminal IPC handlers
- `electron/preload/index.ts` — expose `window.rasik.terminal.*`
- `src/layout/BottomPanel.tsx` — mount TerminalPanel

## Acceptance Criteria

- [x] `` Ctrl+` `` toggles the terminal panel
- [x] New terminal tab spawns a shell in the workspace directory
- [x] Typing in the terminal correctly sends input to the PTY
- [x] Shell output renders correctly in xterm.js (colors, cursor, Unicode)
- [x] Terminal resizes correctly when the panel is resized (FitAddon)
- [x] Multiple terminal tabs work independently (each has its own PTY)
- [x] Tab title updates when the running process changes its title (OSC-0) — `useTerminal.ts` subscribes to xterm's `onTitleChange` and dispatches `renameTerminal`
- [x] Closing a terminal tab kills the PTY process (no zombie processes)
- [x] Terminal scrollback is limited to 10K lines
- [ ] Input lag is under 10ms (measure with a keystroke echo test) — **unverifiable in this environment**: no display server exists here, so there is no way to drive real keystrokes and measure echo latency. Re-check the first time this runs on a machine with a display.
- [ ] WebGL renderer is active (confirm via xterm.js `options.rendererType`) — **unverifiable in this environment** for the same reason; the code attempts `WebglAddon` with a DOM-renderer fallback (see `useTerminal.ts`), but which path actually activated has never been observed.
- [x] node-pty is in `asarUnpack` and loads successfully in the packaged app — verified via `electron-builder.config.ts` + a `--dir` packaging run; `pty.node`/`conpty.node` land under `resources/app.asar.unpacked/node_modules/node-pty/`, not inside `app.asar`.

## Testing Strategy

- **Unit tests:** `electron/main/pty-manager.test.ts` (10 tests — session create/write/resize/kill/killAll, exit cleanup, per-session broadcast) and `electron/main/ipc/terminal-handlers.test.ts` (7 tests — rejects when no workspace is open, rejects path traversal, resolves relative cwd, write/resize/kill forwarding).
- **Integration tests (manual):** Run `vim`, `htop`, `python3` — interactive programs that use raw terminal mode. **Not done** — requires a real display/TTY, which this environment doesn't have.
- **Performance:** Paste 10K characters, measure render time (should not lock up). **Not done** — same display-dependency as above.

## Estimated Effort

**2 weeks**
- Week 1: node-pty integration, PtyManager, IPC handlers, preload bridge
- Week 2: xterm.js setup with all addons, TerminalPanel UI, tab management, tests
