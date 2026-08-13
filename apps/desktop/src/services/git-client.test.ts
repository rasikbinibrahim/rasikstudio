import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateCommitMessage } from './git-client'

describe('git-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the diff and model, returning the generated message', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: 'fix: correct off-by-one error' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateCommitMessage('tok', 'diff --git a/x b/x\n+1', 'qwen2.5-coder:1.5b')

    expect(result).toBe('fix: correct off-by-one error')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/git/generate-commit-message',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ diff: 'diff --git a/x b/x\n+1', model: 'qwen2.5-coder:1.5b' }),
      }),
    )
  })

  it('throws with the backend error message on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ error: { message: 'Diff too large' } }),
      })),
    )

    await expect(generateCommitMessage('tok', 'diff', 'model')).rejects.toThrow('Diff too large')
  })

  it('falls back to a generic message when the error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    )

    await expect(generateCommitMessage('tok', 'diff', 'model')).rejects.toThrow('Request failed (500)')
  })

  it('falls back to a generic message when the error body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json')
        },
      })),
    )

    await expect(generateCommitMessage('tok', 'diff', 'model')).rejects.toThrow('Request failed (500)')
  })
})
