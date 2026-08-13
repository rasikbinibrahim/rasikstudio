import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AuthApi,
  BrowserApi,
  DockerApi,
  FilesApi,
  GitApi,
  LspApi,
  MenuApi,
  ShellApi,
  TerminalApi,
  WorkspaceApi,
} from '../../src/types/ipc'
import type { LspNotification } from '../../src/types/lsp'

const files: FilesApi = {
  read: (relativePath) => ipcRenderer.invoke('files:read', relativePath),
  write: (relativePath, content) => ipcRenderer.invoke('files:write', relativePath, content),
  list: (relativeDirPath) => ipcRenderer.invoke('files:list', relativeDirPath),
  listAll: () => ipcRenderer.invoke('files:listAll'),
  move: (fromRelativePath, toRelativePath) =>
    ipcRenderer.invoke('files:move', fromRelativePath, toRelativePath),
  delete: (relativePath) => ipcRenderer.invoke('files:delete', relativePath),
}

const shellApi: ShellApi = {
  showItemInFolder: (relativePath) => ipcRenderer.invoke('shell:showItemInFolder', relativePath),
}

const workspace: WorkspaceApi = {
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  openPath: (path) => ipcRenderer.invoke('workspace:openPath', path),
  getRoot: () => ipcRenderer.invoke('workspace:getRoot'),
  // `File.path` was removed in Electron 32 — `webUtils.getPathForFile` is the replacement, and it
  // only works from the main/preload side (contextIsolation blocks the renderer from touching
  // Electron APIs directly), which is why this has to be a bridged call rather than something
  // FileExplorer.tsx could do to the dropped `File` object itself.
  getPathForFile: (file) => webUtils.getPathForFile(file),
}

const terminal: TerminalApi = {
  create: (relativeCwd) => ipcRenderer.invoke('terminal:create', relativeCwd),
  write: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id) => ipcRenderer.invoke('terminal:kill', id),
  onData: (id, handler) => {
    const channel = `terminal:data:${id}`
    const listener = (_event: IpcRendererEvent, data: string): void => handler(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onExit: (id, handler) => {
    const channel = `terminal:exit:${id}`
    const listener = (_event: IpcRendererEvent, exitCode: number): void => handler(exitCode)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

const auth: AuthApi = {
  save: (payload) => ipcRenderer.invoke('auth:save', payload),
  load: () => ipcRenderer.invoke('auth:load'),
  clear: () => ipcRenderer.invoke('auth:clear'),
}

const git: GitApi = {
  status: () => ipcRenderer.invoke('git:status'),
  stage: (paths) => ipcRenderer.invoke('git:stage', paths),
  unstage: (paths) => ipcRenderer.invoke('git:unstage', paths),
  commit: (message) => ipcRenderer.invoke('git:commit', message),
  diff: (staged, filePath) => ipcRenderer.invoke('git:diff', staged, filePath),
  showFile: (ref, filePath) => ipcRenderer.invoke('git:showFile', ref, filePath),
  log: (limit, branch) => ipcRenderer.invoke('git:log', limit, branch),
  branches: () => ipcRenderer.invoke('git:branches'),
  checkout: (branch) => ipcRenderer.invoke('git:checkout', branch),
  push: () => ipcRenderer.invoke('git:push'),
  pull: () => ipcRenderer.invoke('git:pull'),
}

const browser: BrowserApi = {
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  setBounds: (bounds) => ipcRenderer.send('browser:setBounds', bounds),
  hide: () => ipcRenderer.send('browser:hide'),
  getState: () => ipcRenderer.invoke('browser:getState'),
  onStateChange: (handler) => {
    const listener = (_event: IpcRendererEvent, state: Parameters<typeof handler>[0]): void => handler(state)
    ipcRenderer.on('browser:state', listener)
    return () => ipcRenderer.removeListener('browser:state', listener)
  },
}

const docker: DockerApi = {
  list: () => ipcRenderer.invoke('docker:list'),
  start: (id) => ipcRenderer.invoke('docker:start', id),
  stop: (id) => ipcRenderer.invoke('docker:stop', id),
  restart: (id) => ipcRenderer.invoke('docker:restart', id),
  remove: (id) => ipcRenderer.invoke('docker:remove', id),
  startLogs: (id) => ipcRenderer.send('docker:logs:start', id),
  stopLogs: (id) => ipcRenderer.send('docker:logs:stop', id),
  onLogData: (id, handler) => {
    const channel = `docker:logs:data:${id}`
    const listener = (_event: IpcRendererEvent, chunk: string): void => handler(chunk)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onLogClosed: (id, handler) => {
    const channel = `docker:logs:closed:${id}`
    const listener = (): void => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  exec: (id) => ipcRenderer.invoke('docker:exec', id),
}

const lsp: LspApi = {
  start: (language) => ipcRenderer.invoke('lsp:start', language),
  request: (language, method, params) => ipcRenderer.invoke('lsp:request', language, method, params),
  notify: (language, method, params) => ipcRenderer.send('lsp:notify', language, method, params),
  stop: (language) => ipcRenderer.invoke('lsp:stop', language),
  onNotification: (handler) => {
    const listener = (_event: IpcRendererEvent, notification: LspNotification): void =>
      handler(notification)
    ipcRenderer.on('lsp:notification', listener)
    return () => ipcRenderer.removeListener('lsp:notification', listener)
  },
}

const menu: MenuApi = {
  onCommand: (handler) => {
    const listener = (_event: IpcRendererEvent, commandId: string): void => handler(commandId)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
}

const rasikApi = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  // A plain, static string — safe to expose directly with no IPC round trip, unlike the rest of
  // this bridge. `FileTreeNode.tsx`'s `copyPath()` uses it to join `workspaceRoot` (OS-native)
  // with a workspace-relative path (always `/`-separated internally) using the right separator.
  platform: process.platform,
  files,
  workspace,
  terminal,
  shell: shellApi,
  auth,
  menu,
  git,
  browser,
  docker,
  lsp,
}

export type RasikApi = typeof rasikApi

contextBridge.exposeInMainWorld('rasik', rasikApi)
