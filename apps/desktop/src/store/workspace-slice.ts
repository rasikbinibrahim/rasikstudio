import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { basename } from '../lib/path-utils'
import { syncWorkspaceWithBackend } from '../services/workspace-sync'
import { indexWorkspace as callIndexWorkspace } from '../services/indexing-client'

export type IndexingStatus = 'idle' | 'indexing' | 'done' | 'error'

export interface IndexingProgress {
  filesDone: number
  filesTotal: number
}

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
  /** RAG indexing state for the open workspace — `POST /workspaces/{id}/index` (real since
   *  2026-08-11) previously had no desktop caller at all, so `code_embeddings` stayed empty and
   *  chat's RAG context had nothing to find on any real workspace. `indexingStatus` reflects the
   *  most recent run only; it resets to `idle` whenever a different folder is opened. */
  indexingStatus: IndexingStatus
  indexingProgress: IndexingProgress | null
  indexingError: string | null
  openFolder: () => Promise<void>
  /** Drag-and-drop counterpart to `openFolder()` — same effect, given an absolute path directly
   *  (from `FileExplorer.tsx`'s drop handler via `getPathForFile()`) instead of showing a native
   *  picker dialog. Both funnel through `applyWorkspaceRoot()` below so the backend-sync/WS-connect
   *  logic exists in exactly one place. */
  openFolderAtPath: (path: string) => Promise<void>
  refreshAllFiles: () => Promise<void>
  /** Queues a real indexing run for the open workspace — a no-op if not signed in or the backend
   *  sync hasn't succeeded yet (`backendWorkspaceId` is `null`), same guard `generateCommitMessage`
   *  already uses for its own `accessToken` dependency. */
  startIndexing: () => Promise<void>
  /** Applies a real `index_progress` WebSocket event (`useAiEventBridge.ts`). `filesDone >=
   *  filesTotal` (with at least one file) is the completion signal — `IndexProgressEvent`'s own
   *  doc comment states this is the same event as "workspace indexed," not a separate one. */
  handleIndexProgress: (filesDone: number, filesTotal: number) => void
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
      state.indexingStatus = 'idle'
      state.indexingProgress = null
      state.indexingError = null
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
        // Auto-trigger a real indexing run the moment a workspace becomes backend-synced —
        // previously nothing did this (TASKS.md's "no trigger besides the explicit POST
        // /workspaces/{id}/index call" gap), so `code_embeddings` stayed empty until someone
        // clicked the Index button by hand, making RAG chat context silently empty by default
        // for every workspace. Fire-and-forget: `startIndexing()` already handles its own
        // errors (sets `indexingStatus: 'error'`), and a folder open must not block on it.
        void get().startIndexing()
      }
    }
  }

  return {
    workspaceRoot: null,
    workspaceName: null,
    allFiles: [],
    backendWorkspaceId: null,
    indexingStatus: 'idle',
    indexingProgress: null,
    indexingError: null,

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

    startIndexing: async () => {
      const { accessToken, backendWorkspaceId } = get()
      if (!accessToken || !backendWorkspaceId) return

      set((state) => {
        state.indexingStatus = 'indexing'
        state.indexingProgress = null
        state.indexingError = null
      })
      try {
        await callIndexWorkspace(accessToken, backendWorkspaceId)
      } catch (error) {
        set((state) => {
          state.indexingStatus = 'error'
          state.indexingError = error instanceof Error ? error.message : 'Failed to start indexing'
        })
      }
    },

    handleIndexProgress: (filesDone, filesTotal) => {
      set((state) => {
        state.indexingProgress = { filesDone, filesTotal }
        state.indexingStatus = filesTotal > 0 && filesDone >= filesTotal ? 'done' : 'indexing'
      })
    },
  }
}
