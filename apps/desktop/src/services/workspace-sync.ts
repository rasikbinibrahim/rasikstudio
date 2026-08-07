import { getBackendHttpBaseUrl } from '../lib/backend-config'

export interface BackendWorkspace {
  id: string
  name: string
  root_path: string
}

/** POSTs to `/api/v1/workspaces` to get-or-create the backend workspace row for `rootPath`, so
 *  the desktop app has a UUID to key its WebSocket connection on (see `PROGRESS.md`'s Phase 7
 *  entry for why this didn't exist until now). `POST /workspaces` is idempotent by
 *  `(user_id, root_path)` on the backend — calling this every time a folder is opened is safe,
 *  it won't create duplicate rows.
 *
 *  Best-effort by design: returns `null` on any failure (backend not running, network error,
 *  expired token) rather than throwing. Local file editing (`workspace-slice.ts`'s `openFolder`)
 *  must keep working identically whether or not this succeeds — it's the one thing that's true
 *  regardless of whether the user has ever logged in at all. */
export async function syncWorkspaceWithBackend(
  accessToken: string,
  name: string,
  rootPath: string,
): Promise<BackendWorkspace | null> {
  try {
    const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, root_path: rootPath }),
    })
    if (!response.ok) return null
    return (await response.json()) as BackendWorkspace
  } catch {
    return null
  }
}
