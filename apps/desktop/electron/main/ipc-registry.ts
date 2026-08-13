import { app, ipcMain } from 'electron'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerTerminalHandlers } from './ipc/terminal-handlers'
import { registerShellHandlers } from './ipc/shell-handlers'
import { registerAuthHandlers } from './ipc/auth-handlers'
import { registerGitHandlers } from './ipc/git-handlers'
import { registerBrowserHandlers } from './ipc/browser-handlers'
import { registerDockerHandlers } from './ipc/docker-handlers'
import { registerLspHandlers } from './ipc/lsp-handlers'

/** All `ipcMain.handle()`/`ipcMain.on()` registrations in one place, per
 *  `phase-03-desktop-application-shell.md`'s `IpcHandlerRegistry` — called once, before
 *  `app.whenReady()`, same as it was inline in `index.ts` before this split. */
export function registerAllIpcHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  registerWorkspaceHandlers()
  registerFileHandlers()
  registerTerminalHandlers()
  registerShellHandlers()
  registerAuthHandlers()
  registerGitHandlers()
  registerBrowserHandlers()
  registerDockerHandlers()
  registerLspHandlers()
}
