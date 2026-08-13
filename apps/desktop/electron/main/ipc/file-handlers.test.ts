import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerFileHandlers } from './file-handlers'
import { setWorkspaceRoot } from '../workspace-state'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
  },
}))

// Runs against a real, throwaway directory tree (same "real behavior beats a mock" standard
// git-service.test.ts already established) — these handlers are thin wrappers over real
// node:fs/promises calls plus the path-traversal guard, so the only thing worth verifying is
// that real reads/writes/lists/moves/deletes happen correctly against real files.
describe('file IPC handlers', () => {
  let dir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    dir = await mkdtemp(join(tmpdir(), 'rasik-file-handlers-test-'))
    setWorkspaceRoot(dir)
    registerFileHandlers()
  })

  afterEach(async () => {
    setWorkspaceRoot(null)
    await rm(dir, { recursive: true, force: true })
  })

  describe('files:read', () => {
    it('returns the real content of a file inside the workspace', async () => {
      await writeFile(join(dir, 'a.txt'), 'hello world')

      const result = await handleHandlers.get('files:read')?.({}, 'a.txt')

      expect(result).toEqual({ ok: true, data: 'hello world' })
    })

    it('rejects a path-traversal attempt', async () => {
      const result = await handleHandlers.get('files:read')?.({}, '../../etc/passwd')

      expect(result).toEqual({ ok: false, error: 'Path traversal attempt: ../../etc/passwd' })
    })

    it('rejects when no workspace is open', async () => {
      setWorkspaceRoot(null)

      const result = await handleHandlers.get('files:read')?.({}, 'a.txt')

      expect(result).toEqual({ ok: false, error: 'No workspace is open' })
    })
  })

  describe('files:write', () => {
    it('writes real content to disk', async () => {
      const result = await handleHandlers.get('files:write')?.({}, 'b.txt', 'new content')

      expect(result).toEqual({ ok: true, data: null })
      expect(await readFile(join(dir, 'b.txt'), 'utf-8')).toBe('new content')
    })
  })

  describe('files:list', () => {
    it('lists real directory entries, directories first then alphabetical', async () => {
      await mkdir(join(dir, 'src'))
      await writeFile(join(dir, 'b.txt'), '')
      await writeFile(join(dir, 'a.txt'), '')

      const result = await handleHandlers.get('files:list')?.({}, '')

      expect(result).toEqual({
        ok: true,
        data: [
          { name: 'src', path: 'src', isDirectory: true },
          { name: 'a.txt', path: 'a.txt', isDirectory: false },
          { name: 'b.txt', path: 'b.txt', isDirectory: false },
        ],
      })
    })
  })

  describe('files:listAll', () => {
    it('recursively lists every real file, excluding node_modules', async () => {
      await mkdir(join(dir, 'src'))
      await writeFile(join(dir, 'src', 'app.ts'), '')
      await mkdir(join(dir, 'node_modules'))
      await writeFile(join(dir, 'node_modules', 'ignored.js'), '')
      await writeFile(join(dir, 'README.md'), '')

      const result = await handleHandlers.get('files:listAll')?.({})

      expect(result).toEqual({ ok: true, data: ['README.md', 'src/app.ts'] })
    })
  })

  describe('files:move', () => {
    it('renames a real file on disk', async () => {
      await writeFile(join(dir, 'old.txt'), 'content')

      const result = await handleHandlers.get('files:move')?.({}, 'old.txt', 'new.txt')

      expect(result).toEqual({ ok: true, data: null })
      expect(await readFile(join(dir, 'new.txt'), 'utf-8')).toBe('content')
    })
  })

  describe('files:delete', () => {
    it('deletes a real file from disk', async () => {
      await writeFile(join(dir, 'gone.txt'), '')

      const result = await handleHandlers.get('files:delete')?.({}, 'gone.txt')

      expect(result).toEqual({ ok: true, data: null })
      await expect(readFile(join(dir, 'gone.txt'), 'utf-8')).rejects.toThrow()
    })

    it('deletes a real directory recursively', async () => {
      await mkdir(join(dir, 'sub'))
      await writeFile(join(dir, 'sub', 'inner.txt'), '')

      const result = await handleHandlers.get('files:delete')?.({}, 'sub')

      expect(result).toEqual({ ok: true, data: null })
      await expect(readFile(join(dir, 'sub', 'inner.txt'), 'utf-8')).rejects.toThrow()
    })
  })
})
