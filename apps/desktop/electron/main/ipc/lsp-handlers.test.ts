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

const lspManagerMock = {
  start: vi.fn(),
  request: vi.fn(),
  notify: vi.fn(),
  stop: vi.fn(),
}
vi.mock('../lsp-manager', () => ({
  lspManager: lspManagerMock,
}))

describe('LSP IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()
    getWorkspaceRootMock.mockReturnValue('/workspace/root')

    const { registerLspHandlers } = await import('./lsp-handlers')
    registerLspHandlers()
  })

  describe('lsp:start', () => {
    it('rejects when no workspace is open, without touching the manager', async () => {
      getWorkspaceRootMock.mockReturnValue(null)
      const handler = handleHandlers.get('lsp:start')

      const result = (await handler?.({}, 'typescript')) as IpcResult<null>

      expect(result.ok).toBe(false)
      expect(lspManagerMock.start).not.toHaveBeenCalled()
    })

    it('starts the requested language against the open workspace root', async () => {
      lspManagerMock.start.mockResolvedValue(undefined)
      const handler = handleHandlers.get('lsp:start')

      const result = (await handler?.({}, 'typescript')) as IpcResult<null>

      expect(result).toEqual({ ok: true, data: null })
      expect(lspManagerMock.start).toHaveBeenCalledWith('typescript', '/workspace/root')
    })

    it('surfaces a manager rejection (e.g. no Python LSP available) as a real error, not a thrown exception', async () => {
      lspManagerMock.start.mockRejectedValue(new Error('No Python language server available'))
      const handler = handleHandlers.get('lsp:start')

      const result = (await handler?.({}, 'python')) as IpcResult<null>

      expect(result).toEqual({ ok: false, error: 'No Python language server available' })
    })
  })

  describe('lsp:request', () => {
    it('forwards language/method/params and wraps the result', async () => {
      lspManagerMock.request.mockResolvedValue({ contents: 'hover text' })
      const handler = handleHandlers.get('lsp:request')

      const result = (await handler?.(
        {},
        'typescript',
        'textDocument/hover',
        { textDocument: { uri: 'file:///a.ts' } },
      )) as IpcResult<unknown>

      expect(result).toEqual({ ok: true, data: { contents: 'hover text' } })
      expect(lspManagerMock.request).toHaveBeenCalledWith('typescript', 'textDocument/hover', {
        textDocument: { uri: 'file:///a.ts' },
      })
    })

    it('wraps a rejected request as an error result instead of throwing', async () => {
      lspManagerMock.request.mockRejectedValue(new Error('No running "python" language server'))
      const handler = handleHandlers.get('lsp:request')

      const result = (await handler?.({}, 'python', 'textDocument/hover', {})) as IpcResult<unknown>

      expect(result).toEqual({ ok: false, error: 'No running "python" language server' })
    })
  })

  it('lsp:notify forwards language/method/params to the manager without a response', () => {
    const handler = onHandlers.get('lsp:notify')
    lspManagerMock.notify.mockResolvedValue(undefined)

    handler?.({}, 'typescript', 'textDocument/didChange', { textDocument: { uri: 'file:///a.ts' } })

    expect(lspManagerMock.notify).toHaveBeenCalledWith('typescript', 'textDocument/didChange', {
      textDocument: { uri: 'file:///a.ts' },
    })
  })

  it('lsp:stop stops the session and always resolves ok', () => {
    const handler = handleHandlers.get('lsp:stop')

    const result = handler?.({}, 'typescript') as IpcResult<null>

    expect(result).toEqual({ ok: true, data: null })
    expect(lspManagerMock.stop).toHaveBeenCalledWith('typescript')
  })
})
