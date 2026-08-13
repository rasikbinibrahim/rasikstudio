import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { syncWorkspaceWithBackend } from '../services/workspace-sync'
import { getCurrentUser, refreshToken as apiRefreshToken } from '../services/auth-client'
import { basename } from '../lib/path-utils'

export interface AuthUser {
  id: string
  email: string
  name: string
}

interface PersistedSession {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

// The desktop login/register UI (features/auth/AuthDialog.tsx) populates this slice by calling
// setSession() after a successful /auth/login or /auth/register call. The session is persisted
// via Electron's safeStorage (electron/main/auth-storage.ts, OS-keychain-backed) so it survives
// app restarts — restoreSession() is what reads it back on the next launch. `accessToken` alone
// wouldn't be enough to restore anything real: AUTHENTICATION.md's access tokens expire in 30
// minutes (core/config.py's `access_token_expire_minutes`), so restoring has to be able to use
// the much longer-lived `refreshToken` (30 days) when the access token has already gone stale by
// the time the app is reopened, not just replay whatever was last stored.
export interface AuthSlice {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  /** True while `restoreSession()` (called once, at app startup) is still deciding whether a
   *  persisted session is usable — lets the UI avoid flashing "Sign In" before that's known. */
  authRestoring: boolean
  setSession: (accessToken: string, refreshToken: string, user: AuthUser) => void
  signOut: () => void
  restoreSession: () => Promise<void>
}

function persistSession(state: Pick<AuthSlice, 'accessToken' | 'refreshToken' | 'user'>): void {
  if (!state.accessToken || !state.refreshToken || !state.user) return
  const payload: PersistedSession = {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    user: state.user,
  }
  // Best-effort, matching every other IPC/network call in this store — a failed write (e.g. OS
  // encryption unavailable, per auth-storage.ts) just means the next restart starts signed out.
  void window.rasik.auth.save(JSON.stringify(payload))
}

export const createAuthSlice: StateCreator<AppStore, [['zustand/immer', never]], [], AuthSlice> = (
  set,
  get,
) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  authRestoring: true,

  setSession: (accessToken, refreshToken, user) => {
    set((state) => {
      state.accessToken = accessToken
      state.refreshToken = refreshToken
      state.user = user
    })
    persistSession({ accessToken, refreshToken, user })

    // Signing in is far more likely to happen *after* a folder is already open (local-first
    // editing works without an account at all — AuthDialog.tsx's own description says so) than
    // before. `openFolder()` only attempts the backend sync if a token already exists at the
    // time it runs, so without this the far more common order (open folder, then sign in) would
    // leave `backendWorkspaceId` null forever and every chat/agent feature permanently unusable
    // for a session that started before sign-in. Best-effort, matches `openFolder()`'s own
    // "never throws" contract — a failed sync here just means those features stay unavailable.
    const { workspaceRoot, workspaceName, connectWorkspaceSocket } = get()
    if (workspaceRoot) {
      void (async () => {
        const backendWorkspace = await syncWorkspaceWithBackend(
          accessToken,
          workspaceName ?? basename(workspaceRoot),
          workspaceRoot,
        )
        if (backendWorkspace) {
          set((state) => {
            state.backendWorkspaceId = backendWorkspace.id
          })
          await connectWorkspaceSocket(backendWorkspace.id)
          // Same auto-index trigger as `workspace-slice.ts`'s `openFolder()` — this is the other
          // real path a workspace can become backend-synced (sign in after a folder is already
          // open), and it needs the identical trigger or RAG context would stay silently empty
          // for anyone using this ordering instead.
          void get().startIndexing()
        }
      })()
    }
  },

  signOut: () => {
    get().disconnectWorkspaceSocket()
    set((state) => {
      state.accessToken = null
      state.refreshToken = null
      state.user = null
    })
    void window.rasik.auth.clear()
  },

  /** Called once, at app startup (see `App.tsx`). Three outcomes, in order: (1) nothing was
   *  persisted — leave the app signed out, no network call needed; (2) the persisted access
   *  token still works — restore it directly; (3) it's expired (the common case, given the
   *  30-minute TTL — most restarts happen well after that) — use the persisted refresh token to
   *  get a fresh pair, matching `AUTHENTICATION.md`'s refresh-rotation flow, and persist *that*
   *  new pair (the old refresh token is revoked server-side the instant this succeeds, so the
   *  original persisted blob is no longer valid for a second attempt). Any failure along the way
   *  (backend unreachable, refresh token itself expired/revoked) clears the persisted session
   *  and leaves the user signed out — never throws, never leaves `authRestoring` stuck `true`. */
  restoreSession: async () => {
    try {
      const result = await window.rasik.auth.load()
      if (!result.ok || !result.data) return

      const persisted = JSON.parse(result.data) as PersistedSession

      try {
        const user = await getCurrentUser(persisted.accessToken)
        get().setSession(persisted.accessToken, persisted.refreshToken, {
          id: user.id,
          email: user.email,
          name: user.name,
        })
        return
      } catch {
        // Access token expired or otherwise rejected — fall through to the refresh attempt below.
      }

      const pair = await apiRefreshToken(persisted.refreshToken)
      const user = await getCurrentUser(pair.access_token)
      get().setSession(pair.access_token, pair.refresh_token, {
        id: user.id,
        email: user.email,
        name: user.name,
      })
    } catch {
      void window.rasik.auth.clear()
    } finally {
      set((state) => {
        state.authRestoring = false
      })
    }
  },
})
