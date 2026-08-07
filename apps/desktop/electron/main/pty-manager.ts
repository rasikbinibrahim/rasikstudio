import { BrowserWindow } from 'electron'
import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'

export interface PtySessionOptions {
  /** Absolute path — callers (IPC handlers) are responsible for workspace-root validation before this is called. */
  cwd: string
  shell?: string
  /** Overrides `shell` entirely when set — e.g. `docker-handlers.ts`'s "open shell in container"
   *  spawns `docker` with `args` instead of a login shell, reusing this same PTY/xterm pipeline
   *  rather than building a second terminal implementation. */
  command?: string
  args?: string[]
}

interface PtySession {
  id: string
  pty: IPty
  cwd: string
}

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env['SHELL'] ?? '/bin/bash'
}

/** Single window today — broadcasting to every open window is a no-op beyond the first until
 *  multi-window support (WORKSPACE_MANAGEMENT.md §9) is built. */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

class PtyManager {
  private readonly sessions = new Map<string, PtySession>()

  create(options: PtySessionOptions): string {
    const id = randomUUID()
    const command = options.command ?? options.shell ?? getDefaultShell()
    const args = options.command ? (options.args ?? []) : []

    const ptyProcess = spawn(command, args, {
      name: 'xterm-256color',
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cwd: options.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        RASIK_STUDIO: '1',
        RASIK_WORKSPACE: options.cwd,
      } as Record<string, string>,
    })

    console.info(`[pty] created ${id} (${command}) cwd=${options.cwd}`)

    ptyProcess.onData((data) => {
      broadcast(`terminal:data:${id}`, data)
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (exitCode !== 0) {
        console.warn(`[pty] ${id} exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`)
      }
      broadcast(`terminal:exit:${id}`, exitCode)
      this.sessions.delete(id)
    })

    this.sessions.set(id, { id, pty: ptyProcess, cwd: options.cwd })
    return id
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return
    this.sessions.get(id)?.pty.resize(cols, rows)
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.pty.kill()
    this.sessions.delete(id)
  }

  /** Called on app quit so no orphaned shells survive the window closing. */
  killAll(): void {
    for (const id of Array.from(this.sessions.keys())) this.kill(id)
  }
}

export const ptyManager = new PtyManager()
