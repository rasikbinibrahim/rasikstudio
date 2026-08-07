// Matches apps/backend/app/core/config.py's Settings.host/port defaults (127.0.0.1:8000). Real
// user-configurable now — Settings.tsx's "Backend URL" field calls setBackendHttpBaseUrl(),
// persisted to localStorage the same way lib/theme-storage.ts persists the theme, so every
// service module below always reads the current value rather than one frozen at import time.

const STORAGE_KEY = 'rasik.backendHttpBaseUrl'
export const DEFAULT_BACKEND_HTTP_BASE_URL = 'http://127.0.0.1:8000'

export function getBackendHttpBaseUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_BACKEND_HTTP_BASE_URL
}

/** Derived from the HTTP URL (`http(s)://` -> `ws(s)://`) rather than stored separately — the
 *  desktop app only ever points at one backend, so there is no real case where the two would
 *  need to differ, and storing both invites them to drift apart. */
export function getBackendWsBaseUrl(): string {
  return getBackendHttpBaseUrl().replace(/^http/, 'ws')
}

/** `null`/empty resets to the default rather than persisting an empty string. */
export function setBackendHttpBaseUrl(url: string | null): void {
  const trimmed = url?.trim()
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, trimmed)
  }
}
