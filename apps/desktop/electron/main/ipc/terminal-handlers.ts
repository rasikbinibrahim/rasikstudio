import { ipcMain } from 'electron'
import { getWorkspaceRoot } from '../workspace-state'
import { resolveWorkspacePath, SecurityError } from '../lib/workspace-path'
import { ptyManager } from '../pty-manager'
import type { IpcResult } from '../../../src/types/ipc'

function toError(err: unknown): string {
  if (err instanceof SecurityError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    'terminal:create',
    (_event, relativeCwd?: string): IpcResult<string> => {
      try {
        const root = getWorkspaceRoot()
        if (!root) throw new Error('No workspace is open')
        const cwd = resolveWorkspacePath(root, relativeCwd ?? '')
        const id = ptyManager.create({ cwd })
        return { ok: true, data: id }
      } catch (err) {
        const message = toError(err)
        console.error(`[terminal:create] failed: ${message}`)
        return { ok: false, error: message }
      }
    },
  )

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    ptyManager.write(id, data)
  })

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: string): IpcResult<null> => {
    ptyManager.kill(id)
    return { ok: true, data: null }
  })
}
