import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import type { DockerContainer } from '../types/docker'

const MAX_LOG_CHARS = 200_000 // a runaway/verbose container shouldn't grow this unboundedly in memory

export interface DockerSlice {
  dockerContainers: DockerContainer[]
  dockerContainersLoading: boolean
  dockerContainersError: string | null
  dockerSelectedContainerId: string | null
  dockerLogs: string
  dockerLogsStreaming: boolean

  refreshContainers: () => Promise<void>
  selectContainer: (id: string | null) => void
  startContainer: (id: string) => Promise<void>
  stopContainer: (id: string) => Promise<void>
  restartContainer: (id: string) => Promise<void>
  openContainerShell: (id: string, name: string) => Promise<void>
  /** Called once, from a mount-effect in `DockerPanel.tsx` — registers the log-data/closed
   *  listeners exactly once per app lifetime rather than per selection, since `onLogData`'s
   *  channel name is id-specific and would otherwise leak a listener on every select. */
  handleLogData: (chunk: string) => void
  handleLogClosed: () => void
}

export const createDockerSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  DockerSlice
> = (set, get) => ({
  dockerContainers: [],
  dockerContainersLoading: false,
  dockerContainersError: null,
  dockerSelectedContainerId: null,
  dockerLogs: '',
  dockerLogsStreaming: false,

  refreshContainers: async () => {
    set((state) => {
      state.dockerContainersLoading = true
    })
    const result = await window.rasik.docker.list()
    set((state) => {
      state.dockerContainersLoading = false
      if (result.ok) {
        state.dockerContainers = result.data
        state.dockerContainersError = null
      } else {
        // Docker not installed / daemon not running is the overwhelmingly common reason this
        // fails — DockerPanel.tsx renders this as an empty state, not a red error banner.
        state.dockerContainers = []
        state.dockerContainersError = result.error
      }
    })
  },

  selectContainer: (id) => {
    const previous = get().dockerSelectedContainerId
    if (previous === id) return

    if (previous) window.rasik.docker.stopLogs(previous)

    set((state) => {
      state.dockerSelectedContainerId = id
      state.dockerLogs = ''
      state.dockerLogsStreaming = id !== null
    })

    if (id) window.rasik.docker.startLogs(id)
  },

  startContainer: async (id) => {
    const result = await window.rasik.docker.start(id)
    if (result.ok) await get().refreshContainers()
  },

  stopContainer: async (id) => {
    const result = await window.rasik.docker.stop(id)
    if (result.ok) await get().refreshContainers()
  },

  restartContainer: async (id) => {
    const result = await window.rasik.docker.restart(id)
    if (result.ok) await get().refreshContainers()
  },

  openContainerShell: async (id, name) => {
    const result = await window.rasik.docker.exec(id)
    if (!result.ok) return

    const ptyId = result.data
    set((state) => {
      state.terminals.push({ id: ptyId, title: name, cwd: '', status: 'active' })
      state.activeTerminalId = ptyId
      state.bottomPanelCollapsed = false
    })
  },

  handleLogData: (chunk) => {
    set((state) => {
      const next = state.dockerLogs + chunk
      state.dockerLogs = next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next
    })
  },

  handleLogClosed: () => {
    set((state) => {
      state.dockerLogsStreaming = false
    })
  },
})
