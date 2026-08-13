import { getBackendHttpBaseUrl } from '../lib/backend-config'

export interface OllamaModel {
  name: string
  sizeBytes: number
  modifiedAt: string
}

export interface OllamaPullProgress {
  status: string
  total: number | null
  completed: number | null
  error: string | null
}

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

function ollamaUrl(path: string): string {
  return `${getBackendHttpBaseUrl()}/api/v1/models/ollama${path}`
}

export async function listInstalledOllamaModels(accessToken: string): Promise<OllamaModel[]> {
  const response = await fetch(ollamaUrl('/installed'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
  const body = (await response.json()) as {
    items: { name: string; size_bytes: number; modified_at: string }[]
  }
  return body.items.map((item) => ({
    name: item.name,
    sizeBytes: item.size_bytes,
    modifiedAt: item.modified_at,
  }))
}

/** Consumes `POST /models/ollama/pull`'s real newline-delimited-JSON streaming response — one
 *  `onProgress` call per line Ollama itself emitted while downloading, not a synthesized
 *  percentage. A trailing partial line (the stream can end mid-line if the last chunk boundary
 *  didn't line up with a `\n`) is flushed once `done` after the read loop, not dropped. */
export async function pullOllamaModel(
  accessToken: string,
  name: string,
  onProgress: (progress: OllamaPullProgress) => void,
): Promise<void> {
  const response = await fetch(ollamaUrl('/pull'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ name }),
  })
  if (!response.ok || !response.body) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) onProgress(JSON.parse(line) as OllamaPullProgress)
    }
  }
  if (buffer.trim()) onProgress(JSON.parse(buffer) as OllamaPullProgress)
}

export async function deleteOllamaModel(accessToken: string, name: string): Promise<void> {
  const response = await fetch(ollamaUrl(`/${encodeURIComponent(name)}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
}
