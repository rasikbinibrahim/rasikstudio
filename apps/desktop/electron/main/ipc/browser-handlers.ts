import { BrowserWindow, ipcMain } from 'electron'
import { browserViewManager } from '../browser-view'
import type { BrowserViewBounds, BrowserViewState } from '../../../src/types/browser'
import type { IpcResult } from '../../../src/types/ipc'

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerBrowserHandlers(): void {
  // Pushed to every window (there's only ever one — see `browser-view.ts`) whenever the view
  // navigates, starts/stops loading, or its title changes, so `BrowserPanel.tsx`'s address bar
  // and back/forward buttons stay in sync without polling.
  browserViewManager.setStateChangeListener((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('browser:state', state)
    }
  })

  ipcMain.handle('browser:navigate', async (_event, url: string): Promise<IpcResult<null>> => {
    try {
      await browserViewManager.navigate(url)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('browser:back', (): IpcResult<null> => {
    browserViewManager.goBack()
    return { ok: true, data: null }
  })

  ipcMain.handle('browser:forward', (): IpcResult<null> => {
    browserViewManager.goForward()
    return { ok: true, data: null }
  })

  ipcMain.handle('browser:reload', (): IpcResult<null> => {
    browserViewManager.reload()
    return { ok: true, data: null }
  })

  // Fire-and-forget, like `terminal:write`/`terminal:resize` — these fire on every layout change
  // (window resize, panel resize, sidebar toggle), too frequently to justify a round-trip.
  ipcMain.on('browser:setBounds', (_event, bounds: BrowserViewBounds) => {
    browserViewManager.setBounds(bounds)
  })

  ipcMain.on('browser:hide', () => {
    browserViewManager.hide()
  })

  ipcMain.handle('browser:getState', (): IpcResult<BrowserViewState> => {
    return { ok: true, data: browserViewManager.getState() }
  })
}
