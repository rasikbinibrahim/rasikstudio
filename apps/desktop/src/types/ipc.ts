import type { FileTreeEntry } from './workspace'
import type { GitBranch, GitLogEntry, GitStatusResult } from './git'
import type { BrowserViewBounds, BrowserViewState } from './browser'
import type { DockerContainer } from './docker'
import type { LspLanguage, LspNotification } from './lsp'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FilesApi {
  read: (relativePath: string) => Promise<IpcResult<string>>
  write: (relativePath: string, content: string) => Promise<IpcResult<null>>
  list: (relativeDirPath: string) => Promise<IpcResult<FileTreeEntry[]>>
  /** Recursive workspace-wide file listing, used by quick-open. Capped at 5000 files. */
  listAll: () => Promise<IpcResult<string[]>>
  move: (fromRelativePath: string, toRelativePath: string) => Promise<IpcResult<null>>
  delete: (relativePath: string) => Promise<IpcResult<null>>
}

export interface ShellApi {
  showItemInFolder: (relativePath: string) => Promise<IpcResult<null>>
}

export interface WorkspaceApi {
  openFolder: () => Promise<IpcResult<string | null>>
  /** Drag-and-drop counterpart to `openFolder()` — takes an absolute path (from
   *  `getPathForFile()` below) instead of showing a native picker dialog. */
  openPath: (path: string) => Promise<IpcResult<string | null>>
  getRoot: () => Promise<IpcResult<string | null>>
  /** `File.path` was removed in Electron 32; this is the `webUtils.getPathForFile` replacement,
   *  bridged from the main process since the renderer can't call Electron APIs directly. */
  getPathForFile: (file: File) => string
}

export interface MenuApi {
  /** The native app menu (`electron/main/app-menu.ts`) sends a `commandRegistry` command id for
   *  every actionable item — never its own copy of what a command does. Returns an unsubscribe
   *  function. */
  onCommand: (handler: (commandId: string) => void) => () => void
}

export interface AuthApi {
  /** `payload` is an opaque, caller-serialized JSON blob (the session shape lives in
   *  `store/auth-slice.ts`, not here) — encrypted at rest via Electron's `safeStorage`. */
  save: (payload: string) => Promise<IpcResult<boolean>>
  load: () => Promise<IpcResult<string | null>>
  clear: () => Promise<IpcResult<null>>
}

export interface GitApi {
  status: () => Promise<IpcResult<GitStatusResult>>
  stage: (paths: string[]) => Promise<IpcResult<null>>
  unstage: (paths: string[]) => Promise<IpcResult<null>>
  commit: (message: string) => Promise<IpcResult<null>>
  diff: (staged: boolean, filePath?: string) => Promise<IpcResult<string>>
  /** `ref` is typically `HEAD` or `''` (the index/staged blob) — see `git-service.ts`. */
  showFile: (ref: string, filePath: string) => Promise<IpcResult<string>>
  log: (limit?: number, branch?: string) => Promise<IpcResult<GitLogEntry[]>>
  branches: () => Promise<IpcResult<GitBranch[]>>
  checkout: (branch: string) => Promise<IpcResult<null>>
  push: () => Promise<IpcResult<string>>
  pull: () => Promise<IpcResult<string>>
}

export interface BrowserApi {
  navigate: (url: string) => Promise<IpcResult<null>>
  back: () => Promise<IpcResult<null>>
  forward: () => Promise<IpcResult<null>>
  reload: () => Promise<IpcResult<null>>
  /** Fire-and-forget — called on every layout change (window/panel resize, sidebar toggle). */
  setBounds: (bounds: BrowserViewBounds) => void
  /** Fire-and-forget — collapses the native view when the Browser panel isn't visible. */
  hide: () => void
  getState: () => Promise<IpcResult<BrowserViewState>>
  /** Returns an unsubscribe function. Pushed by the main process on every navigation/loading/title change. */
  onStateChange: (handler: (state: BrowserViewState) => void) => () => void
}

export interface DockerApi {
  list: () => Promise<IpcResult<DockerContainer[]>>
  start: (id: string) => Promise<IpcResult<null>>
  stop: (id: string) => Promise<IpcResult<null>>
  restart: (id: string) => Promise<IpcResult<null>>
  /** `docker rm -f` — removes a container regardless of whether it's currently running. Gated
   *  behind a confirmation dialog in `ContainerList.tsx`, same destructive-action pattern
   *  `FileTreeNode.tsx`'s delete confirmation already establishes. */
  remove: (id: string) => Promise<IpcResult<null>>
  /** Fire-and-forget, mirrors `TerminalApi.write`/`.resize` — the stream's lifecycle is tracked
   *  by `docker-slice.ts`, not by a promise here. */
  startLogs: (id: string) => void
  stopLogs: (id: string) => void
  /** Returns an unsubscribe function. */
  onLogData: (id: string, handler: (chunk: string) => void) => () => void
  /** Fires when the log stream's underlying `docker logs -f` process exits (container removed,
   *  daemon restarted, etc.) — lets the UI stop showing a "streaming" indicator that's gone stale. */
  onLogClosed: (id: string, handler: () => void) => () => void
  /** Opens `docker exec -it {id} /bin/sh` as a new terminal session (same PTY id shape
   *  `TerminalApi.create` returns) — the caller adds it to `terminals` itself. */
  exec: (id: string) => Promise<IpcResult<string>>
}

export interface LspApi {
  /** Idempotent for the workspace that's currently open — rejects with a real, user-facing
   *  message if the server can't be resolved/started (e.g. no Python LSP available). */
  start: (language: LspLanguage) => Promise<IpcResult<null>>
  request: (language: LspLanguage, method: string, params: unknown) => Promise<IpcResult<unknown>>
  /** Fire-and-forget — `textDocument/didOpen`/`didChange`/`didClose` don't have responses. */
  notify: (language: LspLanguage, method: string, params: unknown) => void
  stop: (language: LspLanguage) => Promise<IpcResult<null>>
  /** Server-initiated notifications (diagnostics, log messages, ...), forwarded as they arrive.
   *  Returns an unsubscribe function. */
  onNotification: (handler: (notification: LspNotification) => void) => () => void
}

export interface TerminalApi {
  /** relativeCwd defaults to the workspace root when omitted. */
  create: (relativeCwd?: string) => Promise<IpcResult<string>>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => Promise<IpcResult<null>>
  /** Returns an unsubscribe function. */
  onData: (id: string, handler: (data: string) => void) => () => void
  /** Returns an unsubscribe function. */
  onExit: (id: string, handler: (exitCode: number) => void) => () => void
}
