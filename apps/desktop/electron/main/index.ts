import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerTerminalHandlers } from './ipc/terminal-handlers'
import { registerShellHandlers } from './ipc/shell-handlers'
import { registerAuthHandlers } from './ipc/auth-handlers'
import { registerGitHandlers } from './ipc/git-handlers'
import { registerBrowserHandlers } from './ipc/browser-handlers'
import { registerDockerHandlers } from './ipc/docker-handlers'
import { browserViewManager } from './browser-view'
import { dockerLogStreamManager } from './docker-log-stream'
import { installAppMenu } from './app-menu'
import { installAutoUpdater, stopAutoUpdater } from './auto-updater'
import {
  APP_PROTOCOL_SCHEME,
  installAppProtocolHandler,
  registerAppProtocolAsPrivileged,
} from './protocol-handler'
import { ptyManager } from './pty-manager'

const isDev = !app.isPackaged

// Must happen before `app.whenReady()` — see protocol-handler.ts.
registerAppProtocolAsPrivileged()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Rasik Studio',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  browserViewManager.attachToWindow(window)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadURL(`${APP_PROTOCOL_SCHEME}://renderer/index.html`)
  }
}

ipcMain.handle('app:getVersion', () => app.getVersion())
registerWorkspaceHandlers()
registerFileHandlers()
registerTerminalHandlers()
registerShellHandlers()
registerAuthHandlers()
registerGitHandlers()
registerBrowserHandlers()
registerDockerHandlers()

void app.whenReady().then(() => {
  installAppProtocolHandler(join(__dirname, '../renderer'))
  installAppMenu(isDev)
  installAutoUpdater(isDev)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  dockerLogStreamManager.stopAll()
  stopAutoUpdater()
  if (process.platform !== 'darwin') app.quit()
})
