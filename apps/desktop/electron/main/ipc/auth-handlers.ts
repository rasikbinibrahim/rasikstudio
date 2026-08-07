import { ipcMain } from 'electron'
import { clearSession, loadSession, saveSession } from '../auth-storage'
import type { IpcResult } from '../../../src/types/ipc'

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:save', async (_event, payload: string): Promise<IpcResult<boolean>> => {
    const persisted = await saveSession(payload)
    return { ok: true, data: persisted }
  })

  ipcMain.handle('auth:load', async (): Promise<IpcResult<string | null>> => {
    const payload = await loadSession()
    return { ok: true, data: payload }
  })

  ipcMain.handle('auth:clear', async (): Promise<IpcResult<null>> => {
    await clearSession()
    return { ok: true, data: null }
  })
}
