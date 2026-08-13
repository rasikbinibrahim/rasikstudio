import { getBackendHttpBaseUrl } from '../lib/backend-config'
import type { ModelInfo } from '../types/models'

interface RawModel {
  id: string
  provider: string
  context_window: number
  available: boolean
}

interface RawModelList {
  items: RawModel[]
}

function toModel(raw: RawModel): ModelInfo {
  return { id: raw.id, provider: raw.provider, contextWindow: raw.context_window, available: raw.available }
}

/** `GET /api/v1/models` — the live model catalog `ModelRouter`/`context_manager.py` already use
 *  server-side, now reachable from the desktop too. Previously nothing called this at all;
 *  `ChatSessionList.tsx`/`AgentTaskList.tsx` used their own hardcoded shortlists (still the
 *  fallback if this fails — see `models-slice.ts`). Throws on a non-2xx response, same
 *  convention as every other client in this directory — the caller decides how to degrade. */
export async function listModels(accessToken: string): Promise<ModelInfo[]> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/models`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  const body = (await response.json()) as RawModelList
  return body.items.map(toModel)
}
