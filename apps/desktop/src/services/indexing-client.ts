import { getBackendHttpBaseUrl } from '../lib/backend-config'

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

/** Same client-shape convention as `git-client.ts`/`chat-client.ts` — `POST
 *  /api/v1/workspaces/{id}/index` (`IndexWorkspaceUseCase`, real since 2026-08-11) returns 202
 *  immediately and queues a real Celery job; actual progress arrives over the workspace's shared
 *  WebSocket channel as `index_progress` events, not in this response. This was previously the
 *  last real gap blocking RAG from ever being usable in practice — the backend pipeline existed
 *  with no way to trigger it from the desktop app. */
export async function indexWorkspace(accessToken: string, workspaceId: string): Promise<void> {
  const response = await fetch(
    `${getBackendHttpBaseUrl()}/api/v1/workspaces/${workspaceId}/index`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
}
