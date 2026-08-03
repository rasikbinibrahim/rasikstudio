# apps/desktop/src/features/terminal/

xterm.js terminal emulator with multiple tabs, WebGL rendering, and PTY management via IPC.

## Files (to be created in Phase 11)

| File | Purpose |
|---|---|
| `TerminalPanel.tsx` | Root panel: tab bar + active terminal |
| `TerminalTabBar.tsx` | Tab strip: new tab button, closeable tabs, active indicator |
| `TerminalTab.tsx` | Single tab — contains and manages one xterm.js instance |
| `useTerminal.ts` | Hook: creates PTY via IPC, attaches xterm, streams PTY output |

## xterm.js Configuration

- Renderer: `WebglAddon` (hardware accelerated)
- Addons: `FitAddon` (auto-resize), `Unicode11Addon`, `SearchAddon`
- Scrollback: 10,000 lines (default; user-configurable)
- Font: JetBrains Mono from the design system

## PTY Lifecycle

1. `TerminalTab.tsx` mounts → calls `window.rasik.terminal.create(cwd, shell)`
2. Main process spawns a node-pty PTY, returns `terminalId`
3. IPC event `terminal:data:{terminalId}` streams PTY output to the xterm instance
4. User keystrokes → `window.rasik.terminal.input(terminalId, data)`
5. Tab close → `window.rasik.terminal.kill(terminalId)` → SIGTERM to PTY

## Agent Separation

Agent command execution happens in the FastAPI backend via `asyncio.create_subprocess_exec` — not in the user's PTY. Agent output is streamed over WebSocket as `agent_step` events, shown in `features/agent/` — not in this panel.
