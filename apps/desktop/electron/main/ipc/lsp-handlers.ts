import { ipcMain } from 'electron'
import { getWorkspaceRoot } from '../workspace-state'
import { lspManager } from '../lsp-manager'
import type { LspLanguage } from '../../../src/types/lsp'
import type { IpcResult } from '../../../src/types/ipc'

function toError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerLspHandlers(): void {
  ipcMain.handle(
    'lsp:start',
    async (_event, language: LspLanguage): Promise<IpcResult<null>> => {
      try {
        const root = getWorkspaceRoot()
        if (!root) throw new Error('No workspace is open')
        await lspManager.start(language, root)
        return { ok: true, data: null }
      } catch (err) {
        const message = toError(err)
        console.error(`[lsp:start] ${language} failed: ${message}`)
        return { ok: false, error: message }
      }
    },
  )

  ipcMain.handle(
    'lsp:request',
    async (_event, language: LspLanguage, method: string, params: unknown): Promise<IpcResult<unknown>> => {
      try {
        const data = await lspManager.request(language, method, params)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.on('lsp:notify', (_event, language: LspLanguage, method: string, params: unknown) => {
    void lspManager.notify(language, method, params).catch((err: unknown) => {
      console.error(`[lsp:notify] ${language} ${method} failed: ${toError(err)}`)
    })
  })

  ipcMain.handle('lsp:stop', (_event, language: LspLanguage): IpcResult<null> => {
    lspManager.stop(language)
    return { ok: true, data: null }
  })
}
