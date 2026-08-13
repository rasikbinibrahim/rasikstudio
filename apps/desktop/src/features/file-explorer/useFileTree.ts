import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import { dirname } from '../../lib/path-utils'
import type { FileTreeEntry } from '../../types/workspace'

/** One row in the flattened, virtualizable tree — `FileTree.tsx` renders exactly this list, in
 *  order, instead of `FileTreeNode` recursing into its own expanded children. */
export interface VisibleTreeRow {
  entry: FileTreeEntry
  depth: number
}

export interface FileTreeState {
  rootEntries: FileTreeEntry[]
  childrenByPath: Record<string, FileTreeEntry[]>
  expandedPaths: Set<string>
  loadingPaths: Set<string>
  /** Root entries plus every expanded directory's children, recursively flattened into tree
   *  order — real virtualization needs a flat list, not a recursive component tree, since
   *  `@tanstack/react-virtual` measures/positions a linear sequence of rows (see `FileTree.tsx`). */
  visibleEntries: VisibleTreeRow[]
  toggleExpand: (path: string) => void
  /** Re-fetches the parent directory of the given entry path and quick-open's full-workspace
   *  list — call after a rename, delete, or anything else that changes what's on disk. */
  refreshParentOf: (entryPath: string) => void
}

function flattenVisible(
  entries: FileTreeEntry[],
  depth: number,
  childrenByPath: Record<string, FileTreeEntry[]>,
  expandedPaths: Set<string>,
  out: VisibleTreeRow[],
): void {
  for (const entry of entries) {
    out.push({ entry, depth })
    if (entry.isDirectory && expandedPaths.has(entry.path)) {
      const children = childrenByPath[entry.path]
      if (children) flattenVisible(children, depth + 1, childrenByPath, expandedPaths, out)
    }
  }
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

  const visibleEntries = useMemo(() => {
    const out: VisibleTreeRow[] = []
    flattenVisible(rootEntries, 0, childrenByPath, expandedPaths, out)
    return out
  }, [rootEntries, childrenByPath, expandedPaths])

  return {
    rootEntries,
    childrenByPath,
    expandedPaths,
    loadingPaths,
    visibleEntries,
    toggleExpand,
    refreshParentOf,
  }
}
