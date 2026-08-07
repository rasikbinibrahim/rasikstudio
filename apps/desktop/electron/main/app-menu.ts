import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'

/** Sends `commandId` to the focused renderer's `App.tsx`, which runs it through the same
 *  `commandRegistry` the command palette already uses — the native menu is another entry point
 *  into the *same* commands, never a second implementation of what they do. A menu item with no
 *  focused window (all windows closed, macOS) is a no-op rather than throwing. */
function runRendererCommand(commandId: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', commandId)
}

function fileMenu(): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      { label: 'Open Folder…', click: () => runRendererCommand('workspace.openFolder') },
      { label: 'Save File', accelerator: 'CmdOrCtrl+S', click: () => runRendererCommand('editor.saveFile') },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => runRendererCommand('editor.closeTab') },
      { type: 'separator' },
      {
        label: 'Settings…',
        accelerator: 'CmdOrCtrl+,',
        click: () => runRendererCommand('preferences.openSettings'),
      },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }
}

function editMenu(): MenuItemConstructorOptions {
  // Standard roles — Electron wires these to whatever text input (including Monaco's own hidden
  // textarea) currently has focus. No custom `click` handlers needed for any of these.
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  }
}

function viewMenu(isDev: boolean): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    { label: 'Explorer', click: () => runRendererCommand('view.showExplorer') },
    { label: 'Source Control', accelerator: 'CmdOrCtrl+Shift+G', click: () => runRendererCommand('view.showGit') },
    { label: 'Browser', accelerator: 'CmdOrCtrl+Shift+B', click: () => runRendererCommand('view.showBrowser') },
    { label: 'Docker', accelerator: 'CmdOrCtrl+Shift+D', click: () => runRendererCommand('view.showDocker') },
    { label: 'AI Chat', accelerator: 'CmdOrCtrl+Shift+C', click: () => runRendererCommand('view.showChat') },
    { label: 'Agent Tasks', click: () => runRendererCommand('view.showAgentTasks') },
    { label: 'Terminal', accelerator: 'CmdOrCtrl+`', click: () => runRendererCommand('view.toggleTerminal') },
    { type: 'separator' },
    { label: 'Toggle Theme', click: () => runRendererCommand('view.toggleTheme') },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ]
  if (isDev) {
    submenu.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' })
  }
  return { label: 'View', submenu }
}

function terminalMenu(): MenuItemConstructorOptions {
  return {
    label: 'Terminal',
    submenu: [
      { label: 'New Terminal', click: () => runRendererCommand('terminal.new') },
      { label: 'Toggle Terminal Panel', accelerator: 'CmdOrCtrl+`', click: () => runRendererCommand('view.toggleTerminal') },
    ],
  }
}

function windowMenu(): MenuItemConstructorOptions {
  return { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] }
}

function helpMenu(): MenuItemConstructorOptions {
  // No external links here — this build has no fixed, real documentation/issue-tracker URL to
  // point at yet (see DEPLOYMENT_GUIDE.md's outstanding items), and a placeholder link would be
  // worse than none.
  return {
    label: 'Help',
    submenu: [
      {
        label: 'About Rasik Studio',
        click: () => {
          void dialog.showMessageBox({
            type: 'info',
            title: 'About Rasik Studio',
            message: 'Rasik Studio',
            detail: `Version ${app.getVersion()}`,
          })
        },
      },
    ],
  }
}

/** Builds and installs the native application menu — `phase-03-desktop-application-shell.md`'s
 *  deferred `app-menu.ts` item (`TASKS.md`). Every actionable item runs an existing
 *  `commandRegistry` command via IPC rather than duplicating command logic in the main process. */
export function installAppMenu(isDev: boolean): void {
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          fileMenu(),
          editMenu(),
          viewMenu(isDev),
          terminalMenu(),
          windowMenu(),
          helpMenu(),
        ]
      : [fileMenu(), editMenu(), viewMenu(isDev), terminalMenu(), windowMenu(), helpMenu()]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
