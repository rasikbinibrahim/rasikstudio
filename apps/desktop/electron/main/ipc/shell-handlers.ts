import { ipcMain, shell } from 'electron'
import { getWorkspaceRoot } from '../workspace-state'
import { resolveWorkspacePath, SecurityError } from '../lib/workspace-path'
import type { IpcResult } from '../../../src/types/ipc'

function toError(err: unknown): string {
  if (err instanceof SecurityError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerShellHandlers(): void {
  ipcMain.handle(
    'shell:showItemInFolder',
    (_event, relativePath: string): IpcResult<null> => {
      try {
        const root = getWorkspaceRoot()
        if (!root) throw new Error('No workspace is open')
        const absolute = resolveWorkspacePath(root, relativePath)
        shell.showItemInFolder(absolute)
        return { ok: true, data: null }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )
}
