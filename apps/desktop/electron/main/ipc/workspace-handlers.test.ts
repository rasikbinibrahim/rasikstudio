import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { getWorkspaceRoot, setWorkspaceRoot } from '../workspace-state'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()
const showOpenDialog = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
  },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
}))

const statMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs', () => ({
  promises: { stat: statMock },
}))

describe('workspace IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handleHandlers.clear()
    setWorkspaceRoot(null)
    registerWorkspaceHandlers()
  })

  afterEach(() => {
    setWorkspaceRoot(null)
  })

  describe('workspace:openFolder', () => {
    it('sets the workspace root from the picked directory', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/home/me/project'] })

      const result = await handleHandlers.get('workspace:openFolder')?.({})

      expect(result).toEqual({ ok: true, data: '/home/me/project' })
      expect(getWorkspaceRoot()).toBe('/home/me/project')
    })

    it('leaves the workspace root untouched when the dialog is cancelled', async () => {
      showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })

      const result = await handleHandlers.get('workspace:openFolder')?.({})

      expect(result).toEqual({ ok: true, data: null })
      expect(getWorkspaceRoot()).toBeNull()
    })
  })

  describe('workspace:openPath', () => {
    it('sets the workspace root when the dropped path is a real directory', async () => {
      statMock.mockResolvedValueOnce({ isDirectory: () => true })

      const result = await handleHandlers.get('workspace:openPath')?.({}, '/home/me/dropped')

      expect(result).toEqual({ ok: true, data: '/home/me/dropped' })
      expect(getWorkspaceRoot()).toBe('/home/me/dropped')
    })

    it('rejects a dropped path that is a file, not a directory', async () => {
      statMock.mockResolvedValueOnce({ isDirectory: () => false })

      const result = await handleHandlers.get('workspace:openPath')?.({}, '/home/me/dropped.txt')

      expect(result).toEqual({ ok: false, error: 'Dropped item is not a folder' })
      expect(getWorkspaceRoot()).toBeNull()
    })

    it('rejects a dropped path that does not exist on disk', async () => {
      statMock.mockRejectedValueOnce(new Error('ENOENT'))

      const result = await handleHandlers.get('workspace:openPath')?.({}, '/nowhere')

      expect(result).toEqual({ ok: false, error: 'Path does not exist' })
      expect(getWorkspaceRoot()).toBeNull()
    })
  })

  describe('workspace:getRoot', () => {
    it('reflects whatever the workspace root currently is', async () => {
      setWorkspaceRoot('/home/me/project')

      const result = await handleHandlers.get('workspace:getRoot')?.({})

      expect(result).toEqual({ ok: true, data: '/home/me/project' })
    })
  })
})
