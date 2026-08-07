import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { dirname } from '../../lib/path-utils'
import type { FileTreeEntry } from '../../types/workspace'

export interface FileTreeState {
  rootEntries: FileTreeEntry[]
  childrenByPath: Record<string, FileTreeEntry[]>
  expandedPaths: Set<string>
  loadingPaths: Set<string>
  toggleExpand: (path: string) => void
  /** Re-fetches the parent directory of the given entry path and quick-open's full-workspace
   *  list — call after a rename, delete, or anything else that changes what's on disk. */
  refreshParentOf: (entryPath: string) => void
}

/** Loads the workspace root on mount/workspace change; expands children lazily, on first open only. */
export function useFileTree(): FileTreeState {
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const refreshAllFiles = useAppStore((state) => state.refreshAllFiles)

  const [rootEntries, setRootEntries] = useState<FileTreeEntry[]>([])
  const [childrenByPath, setChildrenByPath] = useState<Record<string, FileTreeEntry[]>>({})
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())

  async function loadDirectory(dirPath: string): Promise<void> {
    const result = await window.rasik.files.list(dirPath)
    if (!result.ok) return
    if (dirPath === '') {
      setRootEntries(result.data)
    } else {
      setChildrenByPath((prev) => ({ ...prev, [dirPath]: result.data }))
    }
  }

  useEffect(() => {
    setChildrenByPath({})
    setExpandedPaths(new Set())

    if (!workspaceRoot) {
      setRootEntries([])
      return
    }

    void loadDirectory('')
  }, [workspaceRoot])

  function toggleExpand(path: string): void {
    setExpandedPaths((prev) => {
      const next = new Set(prev)

      if (next.has(path)) {
        next.delete(path)
        return next
      }

      next.add(path)
      if (!(path in childrenByPath)) {
        setLoadingPaths((prevLoading) => new Set(prevLoading).add(path))
        void loadDirectory(path).finally(() => {
          setLoadingPaths((prevLoading) => {
            const nextLoading = new Set(prevLoading)
            nextLoading.delete(path)
            return nextLoading
          })
        })
      }

      return next
    })
  }

  function refreshParentOf(entryPath: string): void {
    void loadDirectory(dirname(entryPath))
    void refreshAllFiles()
  }

  return { rootEntries, childrenByPath, expandedPaths, loadingPaths, toggleExpand, refreshParentOf }
}
