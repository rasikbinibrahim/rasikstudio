import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { basename } from '../lib/path-utils'
import { syncWorkspaceWithBackend } from '../services/workspace-sync'

export interface WorkspaceSlice {
  workspaceRoot: string | null
  workspaceName: string | null
  /** Flat list of every file in the workspace (quick-open's search space). Refreshed on open. */
  allFiles: string[]
  /** The backend `workspaces` row id for the open folder — `null` until a signed-in user opens a
   *  folder and the best-effort sync in `openFolder()` below succeeds. Every backend-workspace-
   *  scoped feature (chat sessions, agent tasks) keys off this, not `workspaceRoot` (a local path
   *  the backend has no concept of). */
  backendWorkspaceId: string | null
  openFolder: () => Promise<void>
  /** Drag-and-drop counterpart to `openFolder()` — same effect, given an absolute path directly
   *  (from `FileExplorer.tsx`'s drop handler via `getPathForFile()`) instead of showing a native
   *  picker dialog. Both funnel through `applyWorkspaceRoot()` below so the backend-sync/WS-connect
   *  logic exists in exactly one place. */
  openFolderAtPath: (path: string) => Promise<void>
  refreshAllFiles: () => Promise<void>
}

export const createWorkspaceSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  WorkspaceSlice
> = (set, get) => {
  const applyWorkspaceRoot = async (root: string): Promise<void> => {
    const name = basename(root)
    set((state) => {
      state.workspaceRoot = root
      state.workspaceName = name
      state.backendWorkspaceId = null
    })
    await get().refreshAllFiles()

    // Best-effort backend sync + WebSocket connect — only attempted if a token already exists.
    // Chat (Phase 10) and Agent (Phase 8) panels are both no-ops until a user signs in and this
    // succeeds, same honest tradeoff `AuthDialog.tsx` already documents for the WS connection.
    const { accessToken, connectWorkspaceSocket } = get()
    if (accessToken) {
      const backendWorkspace = await syncWorkspaceWithBackend(accessToken, name, root)
      if (backendWorkspace) {
        set((state) => {
          state.backendWorkspaceId = backendWorkspace.id
        })
        await connectWorkspaceSocket(backendWorkspace.id)
      }
    }
  }

  return {
    workspaceRoot: null,
    workspaceName: null,
    allFiles: [],
    backendWorkspaceId: null,

    openFolder: async () => {
      const result = await window.rasik.workspace.openFolder()
      if (!result.ok || !result.data) return
      await applyWorkspaceRoot(result.data)
    },

    openFolderAtPath: async (path: string) => {
      const result = await window.rasik.workspace.openPath(path)
      if (!result.ok || !result.data) return
      await applyWorkspaceRoot(result.data)
    },

    refreshAllFiles: async () => {
      const result = await window.rasik.files.listAll()
      if (!result.ok) return
      set((state) => {
        state.allFiles = result.data
      })
    },
  }
}
