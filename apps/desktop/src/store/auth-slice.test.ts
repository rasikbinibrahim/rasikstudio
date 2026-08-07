import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as authClient from '../services/auth-client'
import type { AuthApi } from '../types/ipc'

vi.mock('../services/auth-client')

function stubAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  const auth: AuthApi = {
    save: vi.fn(async () => ({ ok: true as const, data: true })),
    load: vi.fn(async () => ({ ok: true as const, data: null })),
    clear: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  }
  ;(window as unknown as { rasik: { auth: unknown } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    auth,
  }
  return auth
}

describe('auth-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubAuthApi()
    useAppStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      authRestoring: false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('setSession stores the token, refresh token, and user, and persists them via safeStorage', () => {
    useAppStore.getState().setSession('tok', 'ref', { id: 'u1', email: 'a@example.com', name: 'A' })

    expect(useAppStore.getState().accessToken).toBe('tok')
    expect(useAppStore.getState().refreshToken).toBe('ref')
    expect(useAppStore.getState().user).toEqual({ id: 'u1', email: 'a@example.com', name: 'A' })
    expect(window.rasik.auth.save).toHaveBeenCalledWith(
      JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', user: { id: 'u1', email: 'a@example.com', name: 'A' } }),
    )
  })

  it('signOut clears the token/user, disconnects the workspace socket, and clears the persisted session', () => {
    const disconnect = vi.fn()
    useAppStore.setState({ disconnectWorkspaceSocket: disconnect })
    useAppStore.getState().setSession('tok', 'ref', { id: 'u1', email: 'a@example.com', name: 'A' })

    useAppStore.getState().signOut()

    expect(useAppStore.getState().accessToken).toBeNull()
    expect(useAppStore.getState().refreshToken).toBeNull()
    expect(useAppStore.getState().user).toBeNull()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(window.rasik.auth.clear).toHaveBeenCalledOnce()
  })

  describe('restoreSession', () => {
    it('leaves the app signed out when nothing was persisted', async () => {
      stubAuthApi({ load: vi.fn(async () => ({ ok: true as const, data: null })) })

      await useAppStore.getState().restoreSession()

      expect(useAppStore.getState().user).toBeNull()
      expect(useAppStore.getState().authRestoring).toBe(false)
      expect(authClient.getCurrentUser).not.toHaveBeenCalled()
    })

    it('restores directly when the persisted access token is still valid', async () => {
      stubAuthApi({
        load: vi.fn(async () => ({
          ok: true as const,
          data: JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', user: { id: 'u1' } }),
        })),
      })
      vi.mocked(authClient.getCurrentUser).mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        name: 'A',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00Z',
      })

      await useAppStore.getState().restoreSession()

      expect(useAppStore.getState().accessToken).toBe('tok')
      expect(useAppStore.getState().user).toEqual({ id: 'u1', email: 'a@example.com', name: 'A' })
      expect(authClient.refreshToken).not.toHaveBeenCalled()
      expect(useAppStore.getState().authRestoring).toBe(false)
    })

    it('falls back to refreshing when the persisted access token has expired', async () => {
      stubAuthApi({
        load: vi.fn(async () => ({
          ok: true as const,
          data: JSON.stringify({ accessToken: 'stale', refreshToken: 'ref', user: { id: 'u1' } }),
        })),
      })
      vi.mocked(authClient.getCurrentUser)
        .mockRejectedValueOnce(new Error('token expired'))
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'a@example.com',
          name: 'A',
          avatar_url: null,
          created_at: '2026-01-01T00:00:00Z',
        })
      vi.mocked(authClient.refreshToken).mockResolvedValue({
        access_token: 'fresh',
        refresh_token: 'fresh-ref',
        token_type: 'bearer',
      })

      await useAppStore.getState().restoreSession()

      expect(authClient.refreshToken).toHaveBeenCalledWith('ref')
      expect(useAppStore.getState().accessToken).toBe('fresh')
      expect(useAppStore.getState().refreshToken).toBe('fresh-ref')
      expect(useAppStore.getState().authRestoring).toBe(false)
    })

    it('clears the persisted session and stays signed out when the refresh token itself is rejected', async () => {
      const clear = vi.fn(async () => ({ ok: true as const, data: null }))
      stubAuthApi({
        load: vi.fn(async () => ({
          ok: true as const,
          data: JSON.stringify({ accessToken: 'stale', refreshToken: 'also-expired', user: { id: 'u1' } }),
        })),
        clear,
      })
      vi.mocked(authClient.getCurrentUser).mockRejectedValue(new Error('token expired'))
      vi.mocked(authClient.refreshToken).mockRejectedValue(new Error('refresh token expired'))

      await useAppStore.getState().restoreSession()

      expect(useAppStore.getState().user).toBeNull()
      expect(useAppStore.getState().authRestoring).toBe(false)
      expect(clear).toHaveBeenCalledOnce()
    })
  })
})
