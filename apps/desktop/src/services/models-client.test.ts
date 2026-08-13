import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from './models-client'

describe('models-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the live model catalog and maps snake_case to camelCase', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: 'gpt-4o-mini', provider: 'openai', context_window: 128000, available: true },
          { id: 'qwen2.5-coder:1.5b', provider: 'ollama', context_window: 32768, available: false },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listModels('tok')

    expect(result).toEqual([
      { id: 'gpt-4o-mini', provider: 'openai', contextWindow: 128000, available: true },
      { id: 'qwen2.5-coder:1.5b', provider: 'ollama', contextWindow: 32768, available: false },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))

    await expect(listModels('tok')).rejects.toThrow('Request failed (500)')
  })
})
