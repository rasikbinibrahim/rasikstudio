import { dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Per `phase-15-deployment-pipeline.md`'s own Architecture section: "Check on launch and every 4
 *  hours." */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let intervalHandle: ReturnType<typeof setInterval> | null = null

function promptRestart(): void {
  void dialog
    .showMessageBox({
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: 'A new version of Rasik Studio has been downloaded.',
      detail: 'Restart the app to apply the update. Your work is auto-saved, but any unsaved editor changes should be saved first.',
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall()
    })
}

/** Wires `electron-updater`'s lifecycle to a launch check + a 4-hour poll, per the roadmap's own
 *  architecture: available → download automatically in the background (no interruption); once the
 *  download finishes, prompt to restart. `electron-updater` reads its feed URL from
 *  `electron-builder.config.ts`'s `publish` block (GitHub Releases) — nothing here duplicates that
 *  configuration. A no-op in development: there's no packaged app to update, and `electron-updater`
 *  itself throws if asked to check outside a packaged, code-signed build. */
export function installAutoUpdater(isDev: boolean): void {
  if (isDev) {
    console.info('[auto-updater] skipped in development (no packaged build to update)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.info(`[auto-updater] update available: ${info.version} — downloading in the background`)
  })
  autoUpdater.on('update-downloaded', () => {
    console.info('[auto-updater] update downloaded, prompting to restart')
    promptRestart()
  })
  autoUpdater.on('error', (err) => {
    console.error(`[auto-updater] check/download failed: ${err.message}`)
  })

  void autoUpdater.checkForUpdates()
  intervalHandle = setInterval(() => void autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS)
}

/** Called on app quit so no timer keeps firing after every window has closed. */
export function stopAutoUpdater(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
