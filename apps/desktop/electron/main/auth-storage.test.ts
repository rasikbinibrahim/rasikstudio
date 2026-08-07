import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, loadSession, saveSession } from './auth-storage'

const encryptionAvailable = { value: true }
const files = new Map<string, Buffer>()

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/rasik-test-userdata' },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable.value,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
    decryptString: (buf: Buffer) => buf.toString('utf-8').replace(/^enc:/, ''),
  },
}))

vi.mock('node:fs', () => ({
  promises: {
    writeFile: vi.fn(async (path: string, data: Buffer) => {
      files.set(path, data)
    }),
    readFile: vi.fn(async (path: string) => {
      const data = files.get(path)
      if (!data) throw new Error('ENOENT')
      return data
    }),
    unlink: vi.fn(async (path: string) => {
      if (!files.has(path)) throw new Error('ENOENT')
      files.delete(path)
    }),
  },
}))

describe('auth-storage', () => {
  beforeEach(() => {
    files.clear()
    encryptionAvailable.value = true
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('round-trips a saved session through encryption', async () => {
    const saved = await saveSession('{"accessToken":"tok"}')
    expect(saved).toBe(true)

    const loaded = await loadSession()

    expect(loaded).toBe('{"accessToken":"tok"}')
  })

  it('loadSession returns null when nothing has been saved', async () => {
    const loaded = await loadSession()

    expect(loaded).toBeNull()
  })

  it('does not persist anything when OS-level encryption is unavailable', async () => {
    encryptionAvailable.value = false

    const saved = await saveSession('{"accessToken":"tok"}')

    expect(saved).toBe(false)
    expect(files.size).toBe(0)
  })

  it('loadSession returns null (not an error) when encryption is unavailable', async () => {
    encryptionAvailable.value = false

    const loaded = await loadSession()

    expect(loaded).toBeNull()
  })

  it('clearSession removes a saved session', async () => {
    await saveSession('{"accessToken":"tok"}')

    await clearSession()

    expect(await loadSession()).toBeNull()
  })

  it('clearSession does not throw when nothing was ever saved', async () => {
    await expect(clearSession()).resolves.toBeUndefined()
  })
})
