# Terminal

`` Ctrl+` `` toggles the bottom terminal panel — the first press also starts a shell if none is
running yet. Each tab is a real shell process (your OS default: `powershell.exe` on Windows,
`$SHELL` or `/bin/bash` elsewhere) running in your workspace's root directory, driven by
`node-pty` — the same underlying mechanism a real terminal emulator uses, not a simulation.

## Tabs

Click `+` in the terminal tab bar to open another shell. Each tab keeps its own scrollback and
stays running (just hidden, not killed) when you switch away from it — closing a tab actually
kills that shell process.

## Tab titles

A tab's title tracks what's actually running in it (via the shell's OSC title-setting escape
sequences) — running `vim`, `ssh`, or any program that sets its own terminal title updates the
tab label to match, not just the launch directory.

## Rendering

The terminal uses a real WebGL-accelerated renderer where available, falling back automatically
to a plain DOM renderer if WebGL isn't available (e.g. no GPU, restricted sandbox) — you don't
need to configure this; it detects and falls back on its own.

## Docker container shells

From the Docker panel (see below), "open shell" on a running container opens a real
`docker exec -it <container> /bin/sh` session in a normal terminal tab — the exact same terminal
implementation, not a separate Docker-specific console.

## What isn't built yet

Clickable URL/path links in terminal output, and a dedicated "Agent Terminal" tab that mirrors an
agent task's own shell commands live (agent command output currently shows in the Agent Tasks
panel's step timeline instead, as text, not inside an embedded terminal view).
