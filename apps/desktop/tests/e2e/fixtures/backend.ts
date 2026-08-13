import { DEFAULT_BACKEND_HTTP_BASE_URL } from '../../../src/lib/backend-config'

/** Real reachability check, not a config flag — `chat.spec.ts`/`agent.spec.ts` need an actual
 *  running backend (`docker compose up` + `uv run uvicorn ...`) to test anything real, and
 *  neither this E2E harness nor CI provisions one. A short-timeout `fetch` against the same
 *  `/health/live` endpoint the backend's own Docker `HEALTHCHECK` uses (Phase 15). */
export async function isBackendReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${DEFAULT_BACKEND_HTTP_BASE_URL}/health/live`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}
