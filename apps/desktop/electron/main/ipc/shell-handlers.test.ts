import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { registerShellHandlers } from './shell-handlers'
import { setWorkspaceRoot } from '../workspace-state'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()
const showItemInFolder = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
  },
  shell: { showItemInFolder: (...args: unknown[]) => showItemInFolder(...args) },
}))

describe('shell IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handleHandlers.clear()
    setWorkspaceRoot('/home/me/project')
    registerShellHandlers()
  })

  describe('shell:showItemInFolder', () => {
    it('resolves the relative path against the workspace root and reveals it', () => {
      const result = handleHandlers.get('shell:showItemInFolder')?.({}, 'src/App.tsx')

      expect(result).toEqual({ ok: true, data: null })
      expect(showItemInFolder).toHaveBeenCalledWith(join('/home/me/project', 'src/App.tsx'))
    })

    it('rejects a path-traversal attempt without calling shell.showItemInFolder', () => {
      const result = handleHandlers.get('shell:showItemInFolder')?.({}, '../../etc/passwd')

      expect(result).toEqual({ ok: false, error: 'Path traversal attempt: ../../etc/passwd' })
      expect(showItemInFolder).not.toHaveBeenCalled()
    })

    it('rejects when no workspace is open', () => {
      setWorkspaceRoot(null)

      const result = handleHandlers.get('shell:showItemInFolder')?.({}, 'src/App.tsx')

      expect(result).toEqual({ ok: false, error: 'No workspace is open' })
      expect(showItemInFolder).not.toHaveBeenCalled()
    })
  })
})
