import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { browserViewManager } from './browser-view'
import { APP_PROTOCOL_SCHEME } from './protocol-handler'

/** `WindowManager` — `BrowserWindow` lifecycle, per `phase-03-desktop-application-shell.md`'s
 *  process-model diagram. `PtyManager`/`DockerLogStreamManager`/`LspManager` broadcast via
 *  Electron's own `BrowserWindow.getAllWindows()` directly, not through this class — nothing
 *  currently needs a second way to enumerate windows, so this doesn't add one speculatively. */
class WindowManager {
  createWindow(): BrowserWindow {
    const isDev = !app.isPackaged

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

    return window
  }
}

export const windowManager = new WindowManager()
