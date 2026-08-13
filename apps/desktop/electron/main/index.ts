import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { windowManager } from './window-manager'
import { registerAllIpcHandlers } from './ipc-registry'
import { dockerLogStreamManager } from './docker-log-stream'
import { lspManager } from './lsp-manager'
import { installAppMenu } from './app-menu'
import { installAutoUpdater, stopAutoUpdater } from './auto-updater'
import { installAppProtocolHandler, registerAppProtocolAsPrivileged } from './protocol-handler'
import { ptyManager } from './pty-manager'

const isDev = !app.isPackaged

// Must happen before `app.whenReady()` — see protocol-handler.ts.
registerAppProtocolAsPrivileged()

registerAllIpcHandlers()

void app.whenReady().then(() => {
  installAppProtocolHandler(join(__dirname, '../renderer'))
  installAppMenu(isDev)
  installAutoUpdater(isDev)
  windowManager.createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  dockerLogStreamManager.stopAll()
  lspManager.stopAll()
  stopAutoUpdater()
  if (process.platform !== 'darwin') app.quit()
})
