import { getBackendHttpBaseUrl } from '../lib/backend-config'

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

/** Same `POST /api/v1/git/generate-commit-message` client-shape convention as `chat-client.ts` —
 *  the Electron main process's `GitService` never talks to an AI provider directly, matching
 *  every other AI call in this app going through the backend's `ModelRouter`. */
export async function generateCommitMessage(
  accessToken: string,
  diff: string,
  model: string,
): Promise<string> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/git/generate-commit-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ diff, model }),
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
  const body = (await response.json()) as { message: string }
  return body.message
}
