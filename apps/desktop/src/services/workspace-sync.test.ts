import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncWorkspaceWithBackend } from './workspace-sync'

describe('syncWorkspaceWithBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to /api/v1/workspaces with the bearer token and returns the parsed workspace', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'workspace-1', name: 'proj', root_path: '/tmp/proj' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncWorkspaceWithBackend('a-token', 'proj', '/tmp/proj')

    expect(result).toEqual({ id: 'workspace-1', name: 'proj', root_path: '/tmp/proj' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/workspaces',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer a-token' }),
        body: JSON.stringify({ name: 'proj', root_path: '/tmp/proj' }),
      }),
    )
  })

  it('returns null when the backend responds with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    )

    const result = await syncWorkspaceWithBackend('a-token', 'proj', '/tmp/proj')

    expect(result).toBeNull()
  })

  it('returns null instead of throwing when the backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error')
      }),
    )

    const result = await syncWorkspaceWithBackend('a-token', 'proj', '/tmp/proj')

    expect(result).toBeNull()
  })
})
