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
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

const browserViewManagerMock = {
  navigate: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  reload: vi.fn(),
  setBounds: vi.fn(),
  hide: vi.fn(),
  getState: vi.fn(),
  setStateChangeListener: vi.fn(),
}
vi.mock('../browser-view', () => ({
  browserViewManager: browserViewManagerMock,
}))

describe('browser IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()

    const { registerBrowserHandlers } = await import('./browser-handlers')
    registerBrowserHandlers()
  })

  it('registers a state-change listener on the manager at startup', () => {
    expect(browserViewManagerMock.setStateChangeListener).toHaveBeenCalledOnce()
  })

  it('the state-change listener broadcasts to every open window', async () => {
    const { BrowserWindow } = await import('electron')
    const sendA = vi.fn()
    const sendB = vi.fn()
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      { webContents: { send: sendA } },
      { webContents: { send: sendB } },
    ] as never)

    const listener = browserViewManagerMock.setStateChangeListener.mock.calls[0]?.[0] as (
      state: unknown,
    ) => void
    const state = { url: 'https://example.com', canGoBack: false, canGoForward: false, loading: false, title: '' }
    listener(state)

    expect(sendA).toHaveBeenCalledWith('browser:state', state)
    expect(sendB).toHaveBeenCalledWith('browser:state', state)
  })

  it('browser:navigate delegates to the manager and returns ok on success', async () => {
    browserViewManagerMock.navigate.mockResolvedValueOnce(undefined)

    const result = (await handleHandlers.get('browser:navigate')?.({}, 'https://example.com')) as IpcResult<null>

    expect(browserViewManagerMock.navigate).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ ok: true, data: null })
  })

  it('browser:navigate surfaces a navigation failure as an error result', async () => {
    browserViewManagerMock.navigate.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'))

    const result = (await handleHandlers.get('browser:navigate')?.({}, 'https://bad')) as IpcResult<null>

    expect(result).toEqual({ ok: false, error: 'net::ERR_NAME_NOT_RESOLVED' })
  })

  it('browser:back delegates to the manager', async () => {
    const result = (await handleHandlers.get('browser:back')?.({})) as IpcResult<null>

    expect(browserViewManagerMock.goBack).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, data: null })
  })

  it('browser:forward delegates to the manager', async () => {
    await handleHandlers.get('browser:forward')?.({})

    expect(browserViewManagerMock.goForward).toHaveBeenCalledOnce()
  })

  it('browser:reload delegates to the manager', async () => {
    await handleHandlers.get('browser:reload')?.({})

    expect(browserViewManagerMock.reload).toHaveBeenCalledOnce()
  })

  it('browser:setBounds forwards the bounds via ipcMain.on (fire-and-forget)', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 200 }

    onHandlers.get('browser:setBounds')?.({}, bounds)

    expect(browserViewManagerMock.setBounds).toHaveBeenCalledWith(bounds)
  })

  it('browser:hide forwards via ipcMain.on (fire-and-forget)', () => {
    onHandlers.get('browser:hide')?.({})

    expect(browserViewManagerMock.hide).toHaveBeenCalledOnce()
  })

  it('browser:getState returns the manager state wrapped in an ok result', async () => {
    const state = { url: 'https://example.com', canGoBack: true, canGoForward: false, loading: false, title: 'Ex' }
    browserViewManagerMock.getState.mockReturnValueOnce(state)

    const result = await handleHandlers.get('browser:getState')?.({})

    expect(result).toEqual({ ok: true, data: state })
  })
})
