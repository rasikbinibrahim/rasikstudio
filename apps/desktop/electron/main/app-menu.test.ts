import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MenuItem {
  label?: string
  role?: string
  accelerator?: string
  click?: () => void
  submenu?: MenuItem[]
  type?: string
}

const state = {
  builtTemplate: null as MenuItem[] | null,
  focusedWindowSend: vi.fn(),
}

vi.mock('electron', () => ({
  app: { name: 'Rasik Studio', getVersion: () => '0.1.0' },
  BrowserWindow: {
    getFocusedWindow: () => ({ webContents: { send: state.focusedWindowSend } }),
  },
  dialog: { showMessageBox: vi.fn() },
  Menu: {
    buildFromTemplate: (template: MenuItem[]) => {
      state.builtTemplate = template
      return template
    },
    setApplicationMenu: vi.fn(),
  },
}))

import { installAppMenu } from './app-menu'

function findItem(items: MenuItem[], label: string): MenuItem | undefined {
  for (const item of items) {
    if (item.label === label) return item
    if (item.submenu) {
      const found = findItem(item.submenu, label)
      if (found) return found
    }
  }
  return undefined
}

describe('installAppMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.builtTemplate = null
  })

  it('builds a template with File, Edit, View, Terminal, Window, and Help menus', () => {
    installAppMenu(false)

    const labels = state.builtTemplate?.map((item) => item.label)
    expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Terminal', 'Window', 'Help']))
  })

  it('"Open Folder…" sends the workspace.openFolder command to the focused window', () => {
    installAppMenu(false)

    findItem(state.builtTemplate ?? [], 'Open Folder…')?.click?.()

    expect(state.focusedWindowSend).toHaveBeenCalledWith('menu:command', 'workspace.openFolder')
  })

  it('"AI Chat" sends the view.showChat command', () => {
    installAppMenu(false)

    findItem(state.builtTemplate ?? [], 'AI Chat')?.click?.()

    expect(state.focusedWindowSend).toHaveBeenCalledWith('menu:command', 'view.showChat')
  })

  it('"Source Control" sends the view.showGit command', () => {
    installAppMenu(false)

    findItem(state.builtTemplate ?? [], 'Source Control')?.click?.()

    expect(state.focusedWindowSend).toHaveBeenCalledWith('menu:command', 'view.showGit')
  })

  it('"Browser" sends the view.showBrowser command', () => {
    installAppMenu(false)

    findItem(state.builtTemplate ?? [], 'Browser')?.click?.()

    expect(state.focusedWindowSend).toHaveBeenCalledWith('menu:command', 'view.showBrowser')
  })

  it('"Docker" sends the view.showDocker command', () => {
    installAppMenu(false)

    findItem(state.builtTemplate ?? [], 'Docker')?.click?.()

    expect(state.focusedWindowSend).toHaveBeenCalledWith('menu:command', 'view.showDocker')
  })

  it('only adds Reload/Toggle DevTools to the View menu in dev mode', () => {
    installAppMenu(false)
    const prodViewMenu = findItem(state.builtTemplate ?? [], 'View')?.submenu ?? []
    expect(prodViewMenu.some((item) => item.role === 'toggleDevTools')).toBe(false)

    installAppMenu(true)
    const devViewMenu = findItem(state.builtTemplate ?? [], 'View')?.submenu ?? []
    expect(devViewMenu.some((item) => item.role === 'toggleDevTools')).toBe(true)
  })
})
