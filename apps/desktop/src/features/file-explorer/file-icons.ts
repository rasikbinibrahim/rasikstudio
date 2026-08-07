import {
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Braces,
  Image,
  Settings,
  type LucideIcon,
} from 'lucide-react'

const extensionIcons: Record<string, LucideIcon> = {
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  sh: FileCode,
  json: FileJson,
  yaml: Settings,
  yml: Settings,
  toml: Settings,
  md: FileText,
  txt: FileText,
  css: Braces,
  scss: Braces,
  html: Braces,
  png: Image,
  jpg: Image,
  jpeg: Image,
  svg: Image,
  gif: Image,
}

export function iconForEntry(name: string, isDirectory: boolean, expanded: boolean): LucideIcon {
  if (isDirectory) return expanded ? FolderOpen : Folder

  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return extensionIcons[ext] ?? File
}
