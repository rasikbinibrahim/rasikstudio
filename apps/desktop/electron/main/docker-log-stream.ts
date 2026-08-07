import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const TAIL_LINES = '200'

/** Single window today — same known limitation as `pty-manager.ts`'s `broadcast()`, not
 *  duplicated logic: both will need to become window-scoped together if multi-window support
 *  (`WORKSPACE_MANAGEMENT.md` §9) is ever built. */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

/** Streams `docker logs -f` output to the renderer over per-container IPC channels, mirroring how
 *  `PtyManager` streams terminal output — a long-running child process (not `execFile`, which
 *  waits for exit) whose stdout/stderr chunks get pushed as they arrive. Keyed by container id;
 *  starting a stream that's already running is a no-op rather than a duplicate process, since the
 *  desktop UI only ever wants one active log stream per selected container. */
class DockerLogStreamManager {
  private readonly streams = new Map<string, ChildProcessWithoutNullStreams>()

  start(containerId: string): void {
    if (this.streams.has(containerId)) return

    const child = spawn('docker', ['logs', '-f', '--tail', TAIL_LINES, containerId])

    child.stdout.on('data', (chunk: Buffer) => {
      broadcast(`docker:logs:data:${containerId}`, chunk.toString('utf-8'))
    })
    child.stderr.on('data', (chunk: Buffer) => {
      // Docker writes a container's own stderr stream here too (interleaved, not just CLI
      // errors) — real log content, not a failure signal, so it goes to the same data channel
      // rather than being dropped or surfaced as an error.
      broadcast(`docker:logs:data:${containerId}`, chunk.toString('utf-8'))
    })
    child.on('close', () => {
      this.streams.delete(containerId)
      broadcast(`docker:logs:closed:${containerId}`)
    })
    child.on('error', (err) => {
      console.error(`[docker-logs] ${containerId} stream error: ${err.message}`)
    })

    this.streams.set(containerId, child)
  }

  stop(containerId: string): void {
    const child = this.streams.get(containerId)
    if (!child) return
    child.kill()
    this.streams.delete(containerId)
  }

  /** Called on app quit so no orphaned `docker logs -f` processes survive the window closing. */
  stopAll(): void {
    for (const id of Array.from(this.streams.keys())) this.stop(id)
  }
}

export const dockerLogStreamManager = new DockerLogStreamManager()
