import { afterEach, describe, expect, it, vi } from 'vitest'
import { indexWorkspace } from './indexing-client'

describe('indexing-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the workspace index endpoint with the bearer token', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    await indexWorkspace('tok', 'ws-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/workspaces/ws-1/index',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    )
  })

  it('throws with the backend error message on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Workspace not found' } }),
      })),
    )

    await expect(indexWorkspace('tok', 'missing')).rejects.toThrow('Workspace not found')
  })

  it('falls back to a generic message when the error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )

    await expect(indexWorkspace('tok', 'ws-1')).rejects.toThrow('Request failed (500)')
  })
})
