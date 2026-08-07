import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import type { GitBranch, GitStatusResult } from '../types/git'
import { generateCommitMessage as callGenerateCommitMessage } from '../services/git-client'

export interface GitDiffTarget {
  path: string
  staged: boolean
}

export interface GitSlice {
  gitStatus: GitStatusResult | null
  gitStatusLoading: boolean
  gitStatusError: string | null
  gitBranches: GitBranch[]
  gitDiffTarget: GitDiffTarget | null
  gitCommitMessage: string
  gitCommitting: boolean
  gitGeneratingCommitMessage: boolean

  refreshGitStatus: () => Promise<void>
  refreshGitBranches: () => Promise<void>
  stageFiles: (paths: string[]) => Promise<void>
  unstageFiles: (paths: string[]) => Promise<void>
  openDiff: (path: string, staged: boolean) => void
  closeDiff: () => void
  setCommitMessage: (message: string) => void
  generateCommitMessage: () => Promise<void>
  commit: () => Promise<void>
  checkoutBranch: (branch: string) => Promise<void>
}

/** Same fixed-default-model pattern `types/agent.ts`'s `AGENT_TYPES` and `ChatSessionList.tsx`'s
 *  `DEFAULT_MODELS` already use — a commit-message "Generate" button is a small, secondary
 *  feature that doesn't warrant its own model picker UI. Qwen 2.5 Coder is the project's own
 *  documented default local model for completion-shaped tasks (PROGRESS.md's Decisions Log). */
const COMMIT_MESSAGE_MODEL = 'qwen2.5-coder:1.5b'

export const createGitSlice: StateCreator<AppStore, [['zustand/immer', never]], [], GitSlice> = (
  set,
  get,
) => ({
  gitStatus: null,
  gitStatusLoading: false,
  gitStatusError: null,
  gitBranches: [],
  gitDiffTarget: null,
  gitCommitMessage: '',
  gitCommitting: false,
  gitGeneratingCommitMessage: false,

  refreshGitStatus: async () => {
    set((state) => {
      state.gitStatusLoading = true
    })
    const result = await window.rasik.git.status()
    set((state) => {
      state.gitStatusLoading = false
      if (result.ok) {
        state.gitStatus = result.data
        state.gitStatusError = null
      } else {
        // Not a git repository is the overwhelmingly common reason this fails — not a real
        // error to surface loudly, just "no Git panel content to show" (GitPanel.tsx renders
        // this as an empty state, not a red error banner).
        state.gitStatus = null
        state.gitStatusError = result.error
      }
    })
  },

  refreshGitBranches: async () => {
    const result = await window.rasik.git.branches()
    if (!result.ok) return
    set((state) => {
      state.gitBranches = result.data
    })
  },

  stageFiles: async (paths) => {
    const result = await window.rasik.git.stage(paths)
    if (result.ok) await get().refreshGitStatus()
  },

  unstageFiles: async (paths) => {
    const result = await window.rasik.git.unstage(paths)
    if (result.ok) await get().refreshGitStatus()
  },

  openDiff: (path, staged) => {
    set((state) => {
      state.gitDiffTarget = { path, staged }
    })
  },

  closeDiff: () => {
    set((state) => {
      state.gitDiffTarget = null
    })
  },

  setCommitMessage: (message) => {
    set((state) => {
      state.gitCommitMessage = message
    })
  },

  generateCommitMessage: async () => {
    const { accessToken } = get()
    if (!accessToken) return

    set((state) => {
      state.gitGeneratingCommitMessage = true
    })
    try {
      const diffResult = await window.rasik.git.diff(true)
      if (!diffResult.ok || !diffResult.data.trim()) return
      const message = await callGenerateCommitMessage(accessToken, diffResult.data, COMMIT_MESSAGE_MODEL)
      set((state) => {
        state.gitCommitMessage = message
      })
    } finally {
      set((state) => {
        state.gitGeneratingCommitMessage = false
      })
    }
  },

  commit: async () => {
    const message = get().gitCommitMessage.trim()
    if (!message) return

    set((state) => {
      state.gitCommitting = true
    })
    try {
      const result = await window.rasik.git.commit(message)
      if (result.ok) {
        set((state) => {
          state.gitCommitMessage = ''
        })
        await get().refreshGitStatus()
      }
    } finally {
      set((state) => {
        state.gitCommitting = false
      })
    }
  },

  checkoutBranch: async (branch) => {
    const result = await window.rasik.git.checkout(branch)
    if (result.ok) {
      await get().refreshGitStatus()
      await get().refreshGitBranches()
    }
  },
})
