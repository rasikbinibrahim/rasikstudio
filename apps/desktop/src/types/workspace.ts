export interface Workspace {
  root: string
  name: string
}

export interface OpenFile {
  id: string
  path: string
  name: string
  content: string
  isDirty: boolean
}

export interface FileTreeEntry {
  name: string
  path: string
  isDirectory: boolean
}
