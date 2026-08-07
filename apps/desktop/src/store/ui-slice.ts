import type { StateCreator } from 'zustand'
import type { AppStore } from './types'

export type SidebarView = 'explorer' | 'chat' | 'agents' | 'git' | 'browser' | 'docker'

export interface UiSlice {
  sidebarCollapsed: boolean
  /** Which feature fills the left sidebar slot — `LeftSidebar.tsx`'s own doc comment anticipated
   *  this ("which feature fills this slot depends on the active ActivityBar item") before either
   *  Chat or Agents existed to actually need it. Selecting a view that's already active and
   *  already visible re-collapses the sidebar instead of doing nothing, matching `ActivityBar`'s
   *  existing single-icon toggle behavior. */
  activeSidebarView: SidebarView
  setSidebarView: (view: SidebarView) => void
  bottomPanelCollapsed: boolean
  toggleBottomPanel: () => void
  /** Global (not local `App.tsx` state, unlike the command palette) because `StatusBar` — a
   *  sibling deep inside `IDELayout`, not a child of `App.tsx` — is what triggers opening it. */
  authDialogOpen: boolean
  openAuthDialog: () => void
  closeAuthDialog: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const createUiSlice: StateCreator<AppStore, [['zustand/immer', never]], [], UiSlice> = (
  set,
) => ({
  sidebarCollapsed: false,

  activeSidebarView: 'explorer',
  setSidebarView: (view) => {
    set((state) => {
      if (state.activeSidebarView === view && !state.sidebarCollapsed) {
        state.sidebarCollapsed = true
        return
      }
      state.activeSidebarView = view
      state.sidebarCollapsed = false
    })
  },

  bottomPanelCollapsed: true,
  toggleBottomPanel: () => {
    set((state) => {
      state.bottomPanelCollapsed = !state.bottomPanelCollapsed
    })
  },

  authDialogOpen: false,
  openAuthDialog: () => {
    set((state) => {
      state.authDialogOpen = true
    })
  },
  closeAuthDialog: () => {
    set((state) => {
      state.authDialogOpen = false
    })
  },

  settingsOpen: false,
  openSettings: () => {
    set((state) => {
      state.settingsOpen = true
    })
  },
  closeSettings: () => {
    set((state) => {
      state.settingsOpen = false
    })
  },
})
