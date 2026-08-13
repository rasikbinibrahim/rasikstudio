import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import type { ModelInfo } from '../types/models'
import { listModels as apiListModels } from '../services/models-client'

export interface ModelsSlice {
  models: ModelInfo[]
  modelsLoading: boolean
  /** `false` until the first `loadModels()` attempt finishes (success or failure) — lets a
   *  caller distinguish "haven't tried yet" from "tried, backend has nothing/unreachable," so a
   *  hardcoded fallback list only kicks in once there's a real answer, not before. */
  modelsLoaded: boolean

  /** Fetches the live model catalog once (`GET /api/v1/models`) — a no-op if already loaded or
   *  in flight, so every panel that wants the list (`ChatSessionList.tsx`, `AgentTaskList.tsx`)
   *  can call this on mount without duplicating the fetch. Silently leaves `models` empty on
   *  failure (no token, backend unreachable) rather than surfacing an error — callers fall back
   *  to their own hardcoded shortlist in that case, the same honest-degradation posture this
   *  project already uses for RAG search / embedding failures. */
  loadModels: () => Promise<void>
}

export const createModelsSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  ModelsSlice
> = (set, get) => ({
  models: [],
  modelsLoading: false,
  modelsLoaded: false,

  loadModels: async () => {
    const { accessToken, modelsLoading, modelsLoaded } = get()
    if (!accessToken || modelsLoading || modelsLoaded) return

    set((state) => {
      state.modelsLoading = true
    })
    try {
      const models = await apiListModels(accessToken)
      set((state) => {
        state.models = models
      })
    } catch {
      // Leave `models` empty — callers fall back to their own hardcoded shortlist.
    } finally {
      set((state) => {
        state.modelsLoading = false
        state.modelsLoaded = true
      })
    }
  },
})
