import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/** Persists the desktop session (access + refresh token, plus the user profile) across app
 *  restarts via Electron's `safeStorage` — OS-keychain-backed (Keychain on macOS, DPAPI on
 *  Windows, libsecret on Linux where available) rather than plaintext-on-disk. This is the
 *  feature `store/auth-slice.ts`'s original in-memory-only tradeoff was deliberately deferred
 *  from — see PROGRESS.md/TASKS.md's Phase 7 notes. The renderer never sees raw key material:
 *  encryption/decryption both happen here, in the main process, reached only via
 *  `ipc/auth-handlers.ts`. */

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'session.enc')
}

/** `payload` is an opaque, already-JSON-stringified blob — this module doesn't know or care what
 *  shape it is, only that it's encrypted at rest. Returns `false` (not an error) when OS-level
 *  encryption isn't available on this machine, so the caller can fail open to "not persisted"
 *  rather than throwing and blocking sign-in. */
export async function saveSession(payload: string): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) return false
  const encrypted = safeStorage.encryptString(payload)
  await fs.writeFile(sessionFilePath(), encrypted)
  return true
}

/** Returns `null` for "nothing persisted, or it can't be read/decrypted" — every one of those
 *  cases means the same thing to a caller: start signed out. Never throws. */
export async function loadSession(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const encrypted = await fs.readFile(sessionFilePath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(sessionFilePath())
  } catch {
    // Already gone — clearing a session that was never persisted (or already cleared) isn't an error.
  }
}
