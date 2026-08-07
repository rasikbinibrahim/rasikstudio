import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAuthHandlers } from './auth-handlers'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
  },
}))

const authStorageMock = vi.hoisted(() => ({
  saveSession: vi.fn(async () => true),
  loadSession: vi.fn(async () => null as string | null),
  clearSession: vi.fn(async () => undefined),
}))
vi.mock('../auth-storage', () => authStorageMock)

describe('auth IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handleHandlers.clear()
    registerAuthHandlers()
  })

  it('auth:save delegates to saveSession and reports whether it persisted', async () => {
    authStorageMock.saveSession.mockResolvedValueOnce(true)

    const result = await handleHandlers.get('auth:save')?.({}, '{"accessToken":"tok"}')

    expect(authStorageMock.saveSession).toHaveBeenCalledWith('{"accessToken":"tok"}')
    expect(result).toEqual({ ok: true, data: true })
  })

  it('auth:load returns the persisted payload', async () => {
    authStorageMock.loadSession.mockResolvedValueOnce('{"accessToken":"tok"}')

    const result = await handleHandlers.get('auth:load')?.({})

    expect(result).toEqual({ ok: true, data: '{"accessToken":"tok"}' })
  })

  it('auth:clear delegates to clearSession', async () => {
    const result = await handleHandlers.get('auth:clear')?.({})

    expect(authStorageMock.clearSession).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, data: null })
  })
})
