import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteOllamaModel, listInstalledOllamaModels, pullOllamaModel } from './ollama-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function streamOf(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

describe('ollama-client', () => {
  it('listInstalledOllamaModels maps the response to camelCase', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{ name: 'qwen2.5-coder:1.5b', size_bytes: 986_000_000, modified_at: '2026-08-01T00:00:00Z' }],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await listInstalledOllamaModels('tok')

    expect(models).toEqual([
      { name: 'qwen2.5-coder:1.5b', sizeBytes: 986_000_000, modifiedAt: '2026-08-01T00:00:00Z' },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/models/ollama/installed',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('listInstalledOllamaModels throws with the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Could not reach Ollama' } }) })),
    )

    await expect(listInstalledOllamaModels('tok')).rejects.toThrow('Could not reach Ollama')
  })

  it('pullOllamaModel calls onProgress once per real NDJSON line, including a trailing partial line', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: streamOf([
        '{"status":"pulling manifest","total":null,"completed":null,"error":null}\n',
        '{"status":"downloading","total":1000,"completed":500,"error":null}\n{"status":"success","total":null,"completed":null,"error":null}',
      ]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onProgress = vi.fn()

    await pullOllamaModel('tok', 'qwen2.5-coder:1.5b', onProgress)

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenNthCalledWith(2, { status: 'downloading', total: 1000, completed: 500, error: null })
    expect(onProgress).toHaveBeenNthCalledWith(3, { status: 'success', total: null, completed: null, error: null })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/models/ollama/pull',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'qwen2.5-coder:1.5b' }) }),
    )
  })

  it('pullOllamaModel throws when the request fails before any streaming starts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({ error: { message: 'Could not reach Ollama' } }) })),
    )

    await expect(pullOllamaModel('tok', 'x', vi.fn())).rejects.toThrow('Could not reach Ollama')
  })

  it('deleteOllamaModel sends a DELETE request with the model name in the path', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await deleteOllamaModel('tok', 'qwen2.5-coder:1.5b')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/models/ollama/qwen2.5-coder%3A1.5b',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('deleteOllamaModel throws with the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'Could not reach Ollama' } }) })),
    )

    await expect(deleteOllamaModel('tok', 'x')).rejects.toThrow('Could not reach Ollama')
  })
})
