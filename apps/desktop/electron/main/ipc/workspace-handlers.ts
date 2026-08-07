import { dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { getWorkspaceRoot, setWorkspaceRoot } from '../workspace-state'
import type { IpcResult } from '../../../src/types/ipc'

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:openFolder', async (): Promise<IpcResult<string | null>> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, data: null }
    }
    const root = result.filePaths[0]
    if (!root) return { ok: true, data: null }
    setWorkspaceRoot(root)
    return { ok: true, data: root }
  })

  // Drag-and-drop counterpart to `workspace:openFolder` — same effect (sets the workspace root),
  // no native dialog, since the renderer already has an absolute path from the dropped item
  // (`webUtils.getPathForFile()`, exposed via preload). Rejects anything that isn't actually a
  // directory on disk rather than trusting the renderer's drag payload.
  ipcMain.handle('workspace:openPath', async (_event, path: string): Promise<IpcResult<string | null>> => {
    try {
      const stat = await fs.stat(path)
      if (!stat.isDirectory()) {
        return { ok: false, error: 'Dropped item is not a folder' }
      }
    } catch {
      return { ok: false, error: 'Path does not exist' }
    }
    setWorkspaceRoot(path)
    return { ok: true, data: path }
  })

  ipcMain.handle('workspace:getRoot', (): IpcResult<string | null> => {
    return { ok: true, data: getWorkspaceRoot() }
  })
}
