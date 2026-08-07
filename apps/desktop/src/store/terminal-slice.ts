import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { basename } from '../lib/path-utils'

export interface TerminalSession {
  id: string
  title: string
  cwd: string
  status: 'active' | 'exited'
}

export interface TerminalSlice {
  terminals: TerminalSession[]
  activeTerminalId: string | null
  createTerminal: (relativeCwd?: string) => Promise<void>
  closeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
  markTerminalExited: (id: string) => void
  renameTerminal: (id: string, title: string) => void
}

export const createTerminalSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  TerminalSlice
> = (set, get) => ({
  terminals: [],
  activeTerminalId: null,

  createTerminal: async (relativeCwd) => {
    const result = await window.rasik.terminal.create(relativeCwd)
    if (!result.ok) return

    const id = result.data
    const title = relativeCwd ? basename(relativeCwd) : `Terminal ${get().terminals.length + 1}`

    set((state) => {
      state.terminals.push({ id, title, cwd: relativeCwd ?? '', status: 'active' })
      state.activeTerminalId = id
    })
  },

  closeTerminal: (id) => {
    void window.rasik.terminal.kill(id)

    set((state) => {
      const index = state.terminals.findIndex((t) => t.id === id)
      if (index === -1) return
      state.terminals.splice(index, 1)
      if (state.activeTerminalId === id) {
        const next = state.terminals[index] ?? state.terminals[index - 1]
        state.activeTerminalId = next ? next.id : null
      }
    })
  },

  setActiveTerminal: (id) => {
    set((state) => {
      state.activeTerminalId = id
    })
  },

  markTerminalExited: (id) => {
    set((state) => {
      const terminal = state.terminals.find((t) => t.id === id)
      if (terminal) terminal.status = 'exited'
    })
  },

  /** Driven by the shell's OSC-0/OSC-2 title-change escape sequence (see useTerminal.ts's
   *  `onTitleChange` subscription) so the tab reflects the running process, e.g. "vim" or "git". */
  renameTerminal: (id, title) => {
    if (!title) return
    set((state) => {
      const terminal = state.terminals.find((t) => t.id === id)
      if (terminal) terminal.title = title
    })
  },
})
