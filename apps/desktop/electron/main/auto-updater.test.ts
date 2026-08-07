import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const showMessageBoxMock = vi.fn<(...args: unknown[]) => Promise<{ response: number; checkboxChecked: boolean }>>(
  async () => ({ response: 1, checkboxChecked: false }),
)
vi.mock('electron', () => ({
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBoxMock(...args) },
}))

class FakeAutoUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
}
const fakeAutoUpdater = new FakeAutoUpdater()
vi.mock('electron-updater', () => ({
  autoUpdater: fakeAutoUpdater,
}))

describe('auto-updater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    showMessageBoxMock.mockClear()
    showMessageBoxMock.mockResolvedValue({ response: 1, checkboxChecked: false })
    fakeAutoUpdater.removeAllListeners()
    fakeAutoUpdater.checkForUpdates.mockClear()
    fakeAutoUpdater.quitAndInstall.mockClear()
    fakeAutoUpdater.autoDownload = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing in development — no packaged build to update', async () => {
    const { installAutoUpdater } = await import('./auto-updater')

    installAutoUpdater(true)

    expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks for updates once on launch and enables background auto-download', async () => {
    const { installAutoUpdater } = await import('./auto-updater')

    installAutoUpdater(false)

    expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(fakeAutoUpdater.autoDownload).toBe(true)
  })

  it('checks again every 4 hours', async () => {
    const { installAutoUpdater } = await import('./auto-updater')
    installAutoUpdater(false)
    fakeAutoUpdater.checkForUpdates.mockClear()

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)

    expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('prompts to restart once the update has downloaded, and quitAndInstall on "Restart Now"', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 0, checkboxChecked: false })
    const { installAutoUpdater } = await import('./auto-updater')
    installAutoUpdater(false)

    fakeAutoUpdater.emit('update-downloaded')
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1))
  })

  it('does not quit when the user picks "Later"', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1, checkboxChecked: false })
    const { installAutoUpdater } = await import('./auto-updater')
    installAutoUpdater(false)

    fakeAutoUpdater.emit('update-downloaded')
    await vi.waitFor(() => expect(showMessageBoxMock).toHaveBeenCalledTimes(1))

    expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('stopAutoUpdater clears the 4-hour poll', async () => {
    const { installAutoUpdater, stopAutoUpdater } = await import('./auto-updater')
    installAutoUpdater(false)
    fakeAutoUpdater.checkForUpdates.mockClear()

    stopAutoUpdater()
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)

    expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
})
