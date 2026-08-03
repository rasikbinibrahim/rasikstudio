# Terminal Design — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The embedded terminal gives users a full, interactive shell without leaving the IDE. It uses xterm.js for rendering and node-pty for a real pseudo-terminal (PTY) in the Electron main process. Multiple terminal sessions can be open simultaneously as tabs. AI agents can programmatically send commands and read output.

---

## 2. Architecture

```
Terminal UI (React + xterm.js)
    │ IPC: write data, resize, close
    │
    ▼
Electron Main Process (terminal.ipc.ts)
    │
    ▼
node-pty (PTY)
    │ stdin/stdout/stderr
    ▼
OS Shell (/bin/bash, /bin/zsh, PowerShell, cmd.exe)
```

Data flow:
- **User keystrokes** → xterm.js → IPC `shell:write` → node-pty stdin → shell
- **Shell output** → node-pty stdout → IPC event `shell:data:{id}` → xterm.js `.write()`
- **Window resize** → xterm.js → IPC `shell:resize` → node-pty `.resize(cols, rows)`

---

## 3. PTY Management

```typescript
// electron/ipc/shell.ipc.ts

interface PtySession {
  id: string;
  pty: IPty;
  cwd: string;
  createdAt: Date;
}

class PtyManager {
  private sessions = new Map<string, PtySession>();

  create(options: { cwd: string; shell?: string; env?: Record<string, string> }): string {
    const id = randomUUID();
    const shell = options.shell ?? this.getDefaultShell();
    
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: options.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...options.env,
      },
    });

    pty.onData((data) => {
      mainWindow.webContents.send(`shell:data:${id}`, data);
    });

    pty.onExit(({ exitCode }) => {
      mainWindow.webContents.send(`shell:exit:${id}`, exitCode);
      this.sessions.delete(id);
    });

    this.sessions.set(id, { id, pty, cwd: options.cwd, createdAt: new Date() });
    return id;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.pty.resize(cols, rows);
  }

  kill(id: string): void {
    this.sessions.get(id)?.pty.kill();
    this.sessions.delete(id);
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') return 'powershell.exe';
    return process.env.SHELL ?? '/bin/bash';
  }
}
```

---

## 4. xterm.js Configuration

```typescript
// components/terminal/TerminalPanel.tsx

const term = new Terminal({
  fontFamily: settings.terminal.fontFamily ?? 'JetBrains Mono, Courier New, monospace',
  fontSize: settings.terminal.fontSize ?? 13,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: settings.terminal.scrollback ?? 10_000,
  theme: terminalTheme,    // mapped from app color theme
  allowProposedApi: true,  // for clipboard access
});

// WebGL renderer (best performance)
const webglAddon = new WebglAddon();
term.loadAddon(webglAddon);

// Fit to container size
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
fitAddon.fit();

// Unicode support
term.loadAddon(new Unicode11Addon());
term.unicode.activeVersion = '11';

// Search in terminal output
const searchAddon = new SearchAddon();
term.loadAddon(searchAddon);
```

---

## 5. Terminal Tabs

Multiple terminal sessions are managed as tabs in the terminal panel:

```
┌──────────────────────────────────────────────────────┐
│ bash  ×  │  python  ×  │  node  ×  │  [+]           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  $ npm run dev                                       │
│  > rasik-studio@1.0.0 dev                            │
│  > vite                                              │
│                                                      │
│  VITE v5.0.0  ready in 230 ms                        │
│                                                      │
│  ➜  Local:   http://localhost:5173/                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Tab state in `terminal.store.ts`:
```typescript
interface TerminalTab {
  id: string;
  title: string;         // auto-set from running process name
  shell: string;
  cwd: string;
  status: 'active' | 'busy' | 'exited';
}
```

Tab title is updated dynamically by parsing `OSC 0` (title) escape sequences from the shell.

---

## 6. Terminal-Editor Integration

- **Open terminal at path:** Right-click file/folder in explorer → "Open Terminal Here" → creates a new tab with `cwd` set to that directory.
- **Link detection:** URLs and file paths in terminal output are clickable. File paths open in the editor. URLs open in the browser panel.
- **Error navigation:** Stack traces are parsed; clicking a file:line opens the editor at that position.

---

## 7. Agent Access to Terminal

AI agents can interact with the terminal through the `run_command` tool:

```python
@tool(name="run_command")
async def run_command(command: str, context: AgentContext) -> str:
    """
    Execute a shell command in the workspace directory.
    Returns the combined stdout+stderr output.
    Timeout: 60 seconds.
    """
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=str(context.workspace_root),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ, "TERM": "dumb"},  # no escape codes
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        return "Error: Command timed out after 60 seconds"
    
    return stdout.decode(errors="replace")
```

When an agent runs a command, the output is shown in a dedicated "Agent Terminal" tab in the terminal panel, keeping it separate from user sessions.

---

## 8. Terminal Search

`Ctrl+F` activates inline search in the terminal:

```typescript
searchAddon.findNext(query, {
  regex: false,
  wholeWord: false,
  caseSensitive: false,
  incremental: true,
});
```

---

## 9. Copy/Paste

- **Copy:** `Ctrl+Shift+C` (Linux/Windows), `Cmd+C` (macOS)
- **Paste:** `Ctrl+Shift+V` (Linux/Windows), `Cmd+V` (macOS)
- **Selection auto-copy:** Off by default (configurable)

xterm.js clipboard operations use the `ClipboardAddon`:
```typescript
term.loadAddon(new ClipboardAddon());
```

---

## 10. Shell Environment

The PTY inherits the user's environment (`process.env`) with these overrides:

| Variable | Value | Reason |
|---|---|---|
| `TERM` | `xterm-256color` | Enable 256-color support |
| `COLORTERM` | `truecolor` | Enable true-color support |
| `RASIK_STUDIO` | `1` | Allow shell scripts to detect they're inside Rasik Studio |
| `RASIK_WORKSPACE` | `/path/to/workspace` | Current workspace root |

---

## 11. Performance

- **WebGL renderer:** Hardware-accelerated rendering for smooth scroll and large outputs.
- **Output throttling:** If output arrives faster than 60fps, it is batched and flushed at most every 16ms.
- **Scrollback limit:** Default 10,000 lines. Older lines are evicted automatically.
- **Large output:** Commands that produce >1MB of output are truncated in the agent tool result (not in the real terminal).

---

## 12. Platform Differences

| Platform | Default Shell | PTY Backend |
|---|---|---|
| Linux | `/bin/bash` (or `$SHELL`) | node-pty (native) |
| macOS | `/bin/zsh` (or `$SHELL`) | node-pty (native) |
| Windows | `powershell.exe` | node-pty (ConPTY) |

Windows ConPTY support requires Windows 10 1903+. Older versions fall back to `winpty`.
