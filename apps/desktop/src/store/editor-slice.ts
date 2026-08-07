import type { StateCreator } from 'zustand'
import type { OpenFile } from '../types/workspace'
import type { AppStore } from './types'
import { basename } from '../lib/path-utils'

export interface CursorPosition {
  line: number
  column: number
}

export interface EditorSlice {
  openFiles: OpenFile[]
  activeFileId: string | null
  cursorPosition: CursorPosition | null
  openFile: (path: string) => Promise<void>
  closeFile: (id: string) => void
  /** Closes the tab whose *current* path matches, if any is open — used when a file is deleted. */
  closeFileByPath: (path: string) => void
  setActiveFile: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  setCursorPosition: (position: CursorPosition | null) => void
  /** Updates an open tab's path/name after a rename, keeping its stable `id` (and therefore its
   *  Monaco model + undo history + view state) intact — a rename must not look like closing one
   *  file and opening a different one. */
  renameOpenFile: (oldPath: string, newPath: string) => void
}

export const createEditorSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  EditorSlice
> = (set, get) => ({
  openFiles: [],
  activeFileId: null,
  cursorPosition: null,

  openFile: async (path) => {
    const existing = get().openFiles.find((f) => f.path === path)
    if (existing) {
      set((state) => {
        state.activeFileId = existing.id
      })
      return
    }

    const result = await window.rasik.files.read(path)
    if (!result.ok) return

    set((state) => {
      state.openFiles.push({
        id: path,
        path,
        name: basename(path),
        content: result.data,
        isDirty: false,
      })
      state.activeFileId = path
      state.cursorPosition = null
    })
  },

  closeFile: (id) => {
    set((state) => {
      const index = state.openFiles.findIndex((f) => f.id === id)
      if (index === -1) return
      state.openFiles.splice(index, 1)
      if (state.activeFileId === id) {
        const next = state.openFiles[index] ?? state.openFiles[index - 1]
        state.activeFileId = next ? next.id : null
        state.cursorPosition = null
      }
    })
  },

  closeFileByPath: (path) => {
    const file = get().openFiles.find((f) => f.path === path)
    if (file) get().closeFile(file.id)
  },

  setActiveFile: (id) => {
    set((state) => {
      state.activeFileId = id
      state.cursorPosition = null
    })
  },

  updateContent: (id, content) => {
    set((state) => {
      const file = state.openFiles.find((f) => f.id === id)
      if (file) {
        file.content = content
        file.isDirty = true
      }
    })
  },

  saveFile: async (id) => {
    const file = get().openFiles.find((f) => f.id === id)
    if (!file) return

    const result = await window.rasik.files.write(file.path, file.content)
    if (!result.ok) return

    set((state) => {
      const target = state.openFiles.find((f) => f.id === id)
      if (target) target.isDirty = false
    })
  },

  setCursorPosition: (position) => {
    set((state) => {
      state.cursorPosition = position
    })
  },

  renameOpenFile: (oldPath, newPath) => {
    set((state) => {
      const file = state.openFiles.find((f) => f.path === oldPath)
      if (file) {
        file.path = newPath
        file.name = basename(newPath)
      }
    })
  },
})
