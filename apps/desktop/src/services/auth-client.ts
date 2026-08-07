import { getBackendHttpBaseUrl } from '../lib/backend-config'

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

async function postAuth(path: string, body: Record<string, string>): Promise<TokenPair> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
  return (await response.json()) as TokenPair
}

export function login(email: string, password: string): Promise<TokenPair> {
  return postAuth('/login', { email, password })
}

export function register(email: string, name: string, password: string): Promise<TokenPair> {
  return postAuth('/register', { email, name, password })
}

/** `AUTHENTICATION.md`'s refresh-rotation flow: the returned pair's `refresh_token` is a new one
 *  (the old one is revoked server-side the moment this succeeds) — callers must persist the new
 *  pair, not just the new access token, or the *next* restore/refresh will fail. */
export function refreshToken(refreshToken: string): Promise<TokenPair> {
  return postAuth('/refresh', { refresh_token: refreshToken })
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
  return (await response.json()) as CurrentUser
}
