export type GitChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'

export interface GitFileEntry {
  path: string
  status: GitChangeType
  /** Only set for renamed/copied entries — the path before the rename/copy. */
  origPath?: string
}

export interface GitStatusResult {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: GitFileEntry[]
  unstaged: GitFileEntry[]
  untracked: GitFileEntry[]
  conflicted: GitFileEntry[]
}

export interface GitLogEntry {
  hash: string
  message: string
}

export interface GitBranch {
  name: string
  current: boolean
  remote: boolean
}
