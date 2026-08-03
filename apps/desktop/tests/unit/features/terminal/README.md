# apps/desktop/tests/unit/features/terminal/

Unit tests for terminal panel and PTY lifecycle management.

Key scenarios to cover:
- New tab calls `window.rasik.terminal.create()` and receives a `terminalId`
- PTY data events are written to the xterm instance
- Resizing the panel calls `window.rasik.terminal.resize()` with correct cols/rows
- Closing a tab calls `window.rasik.terminal.kill()`
- Tab title updates when an OSC-0 escape sequence is received
