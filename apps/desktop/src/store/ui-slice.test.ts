import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './index'

describe('ui-slice', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarCollapsed: false,
      activeSidebarView: 'explorer',
      bottomPanelCollapsed: true,
      authDialogOpen: false,
      settingsOpen: false,
    })
  })

  it('setSidebarView switches to a different view and ensures the sidebar is visible', () => {
    useAppStore.getState().setSidebarView('git')

    expect(useAppStore.getState().activeSidebarView).toBe('git')
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setSidebarView un-collapses the sidebar even if the requested view is already active', () => {
    useAppStore.setState({ activeSidebarView: 'git', sidebarCollapsed: true })

    useAppStore.getState().setSidebarView('git')

    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    expect(useAppStore.getState().activeSidebarView).toBe('git')
  })

  it('setSidebarView re-collapses the sidebar when selecting the already-active, already-visible view', () => {
    useAppStore.setState({ activeSidebarView: 'git', sidebarCollapsed: false })

    useAppStore.getState().setSidebarView('git')

    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    expect(useAppStore.getState().activeSidebarView).toBe('git')
  })

  it('toggleBottomPanel flips the collapsed state', () => {
    useAppStore.getState().toggleBottomPanel()
    expect(useAppStore.getState().bottomPanelCollapsed).toBe(false)

    useAppStore.getState().toggleBottomPanel()
    expect(useAppStore.getState().bottomPanelCollapsed).toBe(true)
  })

  it('openAuthDialog / closeAuthDialog toggle authDialogOpen', () => {
    useAppStore.getState().openAuthDialog()
    expect(useAppStore.getState().authDialogOpen).toBe(true)

    useAppStore.getState().closeAuthDialog()
    expect(useAppStore.getState().authDialogOpen).toBe(false)
  })

  it('openSettings / closeSettings toggle settingsOpen', () => {
    useAppStore.getState().openSettings()
    expect(useAppStore.getState().settingsOpen).toBe(true)

    useAppStore.getState().closeSettings()
    expect(useAppStore.getState().settingsOpen).toBe(false)
  })
})
