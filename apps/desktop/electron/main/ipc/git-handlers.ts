import { ipcMain } from 'electron'
import { getWorkspaceRoot } from '../workspace-state'
import { resolveWorkspacePath, SecurityError } from '../lib/workspace-path'
import { GitService } from '../git-service'
import type { GitBranch, GitLogEntry, GitStatusResult } from '../../../src/types/git'
import type { IpcResult } from '../../../src/types/ipc'

function toError(err: unknown): string {
  if (err instanceof SecurityError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

/** A fresh `GitService` per call, built from whatever the workspace root currently is — the
 *  workspace can change (a different folder opened) between calls, so nothing here holds a
 *  service instance across calls the way a longer-lived connection (e.g. `PtyManager`'s sessions)
 *  would need to. */
function serviceForCurrentWorkspace(): GitService {
  const root = getWorkspaceRoot()
  if (!root) throw new Error('No workspace is open')
  return new GitService(root)
}

/** Validates every path the renderer sends is inside the open workspace before it ever reaches a
 *  `git` subprocess argument — same traversal guard `file-handlers.ts` applies to file IPC, per
 *  `phase-12-git-integration.md`'s "All IPC handlers validate that paths are within the workspace
 *  root" acceptance criterion. Git itself takes cwd-relative paths, so the validated relative
 *  path (not the resolved absolute one) is what actually gets passed through. */
function assertPathsInWorkspace(paths: string[]): void {
  const root = getWorkspaceRoot()
  if (!root) throw new Error('No workspace is open')
  for (const path of paths) {
    resolveWorkspacePath(root, path)
  }
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (): Promise<IpcResult<GitStatusResult>> => {
    try {
      const data = await serviceForCurrentWorkspace().status()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:stage', async (_event, paths: string[]): Promise<IpcResult<null>> => {
    try {
      assertPathsInWorkspace(paths)
      await serviceForCurrentWorkspace().stage(paths)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:unstage', async (_event, paths: string[]): Promise<IpcResult<null>> => {
    try {
      assertPathsInWorkspace(paths)
      await serviceForCurrentWorkspace().unstage(paths)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:commit', async (_event, message: string): Promise<IpcResult<null>> => {
    try {
      await serviceForCurrentWorkspace().commit(message)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle(
    'git:diff',
    async (_event, staged: boolean, filePath?: string): Promise<IpcResult<string>> => {
      try {
        if (filePath) assertPathsInWorkspace([filePath])
        const data = await serviceForCurrentWorkspace().diff(staged, filePath)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle(
    'git:showFile',
    async (_event, ref: string, filePath: string): Promise<IpcResult<string>> => {
      try {
        assertPathsInWorkspace([filePath])
        const data = await serviceForCurrentWorkspace().showFile(ref, filePath)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle(
    'git:log',
    async (_event, limit?: number, branch?: string): Promise<IpcResult<GitLogEntry[]>> => {
      try {
        const data = await serviceForCurrentWorkspace().log(limit, branch)
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: toError(err) }
      }
    },
  )

  ipcMain.handle('git:branches', async (): Promise<IpcResult<GitBranch[]>> => {
    try {
      const data = await serviceForCurrentWorkspace().branches()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:checkout', async (_event, branch: string): Promise<IpcResult<null>> => {
    try {
      await serviceForCurrentWorkspace().checkout(branch)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:push', async (): Promise<IpcResult<string>> => {
    try {
      const data = await serviceForCurrentWorkspace().push()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('git:pull', async (): Promise<IpcResult<string>> => {
    try {
      const data = await serviceForCurrentWorkspace().pull()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })
}
