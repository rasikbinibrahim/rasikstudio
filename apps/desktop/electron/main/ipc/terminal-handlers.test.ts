import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcResult } from '../../../src/types/ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()
const onHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: Handler) => {
      onHandlers.set(channel, handler)
    }),
  },
}))

const getWorkspaceRootMock = vi.fn<() => string | null>()
vi.mock('../workspace-state', () => ({
  getWorkspaceRoot: () => getWorkspaceRootMock(),
}))

const ptyManagerMock = {
  create: vi.fn(() => 'session-id'),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
}
vi.mock('../pty-manager', () => ({
  ptyManager: ptyManagerMock,
}))

describe('terminal IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()
    getWorkspaceRootMock.mockReturnValue('/workspace/root')
    ptyManagerMock.create.mockReturnValue('session-id')

    const { registerTerminalHandlers } = await import('./terminal-handlers')
    registerTerminalHandlers()
  })

  describe('terminal:create', () => {
    it('rejects when no workspace is open', async () => {
      getWorkspaceRootMock.mockReturnValue(null)
      const handler = handleHandlers.get('terminal:create')
      expect(handler).toBeDefined()

      const result = (await handler?.({}, undefined)) as IpcResult<string>

      expect(result.ok).toBe(false)
      expect(ptyManagerMock.create).not.toHaveBeenCalled()
    })

    it('rejects a path-traversal cwd outside the workspace root', async () => {
      const handler = handleHandlers.get('terminal:create')

      const result = (await handler?.({}, '../../etc')) as IpcResult<string>

      expect(result.ok).toBe(false)
      expect(ptyManagerMock.create).not.toHaveBeenCalled()
    })

    it('spawns a PTY rooted at the workspace when no relative cwd is given', async () => {
      const handler = handleHandlers.get('terminal:create')

      const result = (await handler?.({}, undefined)) as IpcResult<string>

      expect(result).toEqual({ ok: true, data: 'session-id' })
      expect(ptyManagerMock.create).toHaveBeenCalledWith({ cwd: '/workspace/root' })
    })

    it('resolves a relative cwd against the workspace root', async () => {
      const handler = handleHandlers.get('terminal:create')

      const result = (await handler?.({}, 'src')) as IpcResult<string>

      expect(result.ok).toBe(true)
      expect(ptyManagerMock.create).toHaveBeenCalledWith({ cwd: '/workspace/root/src' })
    })
  })

  it('terminal:write forwards id and data to the PtyManager', () => {
    const handler = onHandlers.get('terminal:write')
    handler?.({}, 'session-id', 'echo hi\n')

    expect(ptyManagerMock.write).toHaveBeenCalledWith('session-id', 'echo hi\n')
  })

  it('terminal:resize forwards id, cols, and rows to the PtyManager', () => {
    const handler = onHandlers.get('terminal:resize')
    handler?.({}, 'session-id', 100, 30)

    expect(ptyManagerMock.resize).toHaveBeenCalledWith('session-id', 100, 30)
  })

  it('terminal:kill kills the session and always resolves ok', async () => {
    const handler = handleHandlers.get('terminal:kill')

    const result = (await handler?.({}, 'session-id')) as IpcResult<null>

    expect(result).toEqual({ ok: true, data: null })
    expect(ptyManagerMock.kill).toHaveBeenCalledWith('session-id')
  })
})
