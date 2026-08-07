import { ipcMain } from 'electron'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { getWorkspaceRoot } from '../workspace-state'
import { resolveWorkspacePath, SecurityError } from '../lib/workspace-path'
import type { IpcResult } from '../../../src/types/ipc'
import type { FileTreeEntry } from '../../../src/types/workspace'

function resolveOrThrow(relativePath: string): string {
  const root = getWorkspaceRoot()
  if (!root) throw new Error('No workspace is open')
  return resolveWorkspacePath(root, relativePath)
}

function toError(err: unknown): string {
  if (err instanceof SecurityError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '__pycache__',
  '.venv',
  '.turbo',
  '.pnpm-store',
  'dist-electron',
  '.next',
  'target',
])

/** Used by quick-open (`files:listAll`), which needs every file path up front — unlike the
 *  lazy per-directory `files:list` used by the tree view. Capped to bound worst-case cost on
 *  very large workspaces. */
const MAX_LISTED_FILES = 5000

async function collectFilesRecursive(
  absoluteDir: string,
  workspaceRoot: string,
  results: string[],
): Promise<void> {
  if (results.length >= MAX_LISTED_FILES) return

  const dirents = await readdir(absoluteDir, { withFileTypes: true })
  for (const dirent of dirents) {
    if (results.length >= MAX_LISTED_FILES) return

    if (dirent.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(dirent.name)) continue
      await collectFilesRecursive(join(absoluteDir, dirent.name), workspaceRoot, results)
    } else if (dirent.isFile()) {
      const absolutePath = join(absoluteDir, dirent.name)
      results.push(relative(workspaceRoot, absolutePath).split('\\').join('/'))
    }
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('files:read', async (_event, relativePath: string): Promise<IpcResult<string>> => {
    try {
      const absolute = resolveOrThrow(relativePath)
      const content = await readFile(absolute, 'utf-8')
      return { ok: true, data: content }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle(
    'files:write',
    async (_event, relativePath: string, content: string): Promise<IpcResult<null>> => {
      try {
        const absolute = resolveOrThrow(relativePath)
        await writeFile(absolute, content, 'utf-8')
        return { ok: true, data: null }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle(
    'files:list',
    async (_event, relativeDirPath: string): Promise<IpcResult<FileTreeEntry[]>> => {
      try {
        const root = getWorkspaceRoot()
        if (!root) throw new Error('No workspace is open')
        const absolute = resolveWorkspacePath(root, relativeDirPath)
        const dirents = await readdir(absolute, { withFileTypes: true })

        const entries: FileTreeEntry[] = dirents
          .filter((d) => d.isDirectory() || d.isFile())
          .map((d) => {
            const childRelativePath = relativeDirPath ? `${relativeDirPath}/${d.name}` : d.name
            const absoluteChild = resolveWorkspacePath(root, childRelativePath)
            return {
              name: d.name,
              path: relative(root, absoluteChild).split('\\').join('/'),
              isDirectory: d.isDirectory(),
            }
          })
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        return { ok: true, data: entries }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle('files:listAll', async (): Promise<IpcResult<string[]>> => {
    try {
      const root = getWorkspaceRoot()
      if (!root) throw new Error('No workspace is open')

      const results: string[] = []
      await collectFilesRecursive(root, root, results)
      results.sort((a, b) => a.localeCompare(b))

      return { ok: true, data: results }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle(
    'files:move',
    async (_event, fromRelativePath: string, toRelativePath: string): Promise<IpcResult<null>> => {
      try {
        const from = resolveOrThrow(fromRelativePath)
        const to = resolveOrThrow(toRelativePath)
        await rename(from, to)
        return { ok: true, data: null }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle('files:delete', async (_event, relativePath: string): Promise<IpcResult<null>> => {
    try {
      const absolute = resolveOrThrow(relativePath)
      await rm(absolute, { recursive: true })
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })
}
