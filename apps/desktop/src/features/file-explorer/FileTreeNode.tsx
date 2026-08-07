import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { iconForEntry } from './file-icons'
import { ContextMenu, Dialog, Button } from '../../components/ui'
import { useAppStore } from '../../store'
import { dirname, joinPath } from '../../lib/path-utils'
import { getGitDecorationForPath, STATUS_COLOR_CLASS } from '../git/git-status-display'
import type { FileTreeEntry } from '../../types/workspace'
import type { FileTreeState } from './useFileTree'

export interface FileTreeNodeProps {
  entry: FileTreeEntry
  depth: number
  tree: FileTreeState
}

export function FileTreeNode({ entry, depth, tree }: FileTreeNodeProps): JSX.Element {
  const openFile = useAppStore((state) => state.openFile)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const createTerminal = useAppStore((state) => state.createTerminal)
  const toggleBottomPanel = useAppStore((state) => state.toggleBottomPanel)
  const bottomPanelCollapsed = useAppStore((state) => state.bottomPanelCollapsed)
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const renameOpenFile = useAppStore((state) => state.renameOpenFile)
  const closeFileByPath = useAppStore((state) => state.closeFileByPath)
  const gitStatus = useAppStore((state) => state.gitStatus)

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  // Enter/Escape already decide the rename's outcome; without this, the input unmounting in
  // response can also fire onBlur, re-triggering (or wrongly triggering, on Escape) a commit.
  const skipNextBlurRef = useRef(false)

  const expanded = tree.expandedPaths.has(entry.path)
  const loading = tree.loadingPaths.has(entry.path)
  const isActive = !entry.isDirectory && activeFileId === entry.path
  const Icon = iconForEntry(entry.name, entry.isDirectory, expanded)
  const gitDecoration = getGitDecorationForPath(gitStatus, entry.path, entry.isDirectory)

  function handleActivate(): void {
    if (entry.isDirectory) {
      tree.toggleExpand(entry.path)
    } else {
      void openFile(entry.path)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  function openTerminalHere(): void {
    const targetDir = entry.isDirectory ? entry.path : dirname(entry.path)
    if (bottomPanelCollapsed) toggleBottomPanel()
    void createTerminal(targetDir)
  }

  function startRename(): void {
    setRenameValue(entry.name)
    setIsRenaming(true)
  }

  async function commitRename(): Promise<void> {
    const trimmed = renameValue.trim()
    setIsRenaming(false)
    if (!trimmed || trimmed === entry.name) return

    const newPath = joinPath(dirname(entry.path), trimmed)
    const result = await window.rasik.files.move(entry.path, newPath)
    if (!result.ok) return

    renameOpenFile(entry.path, newPath)
    tree.refreshParentOf(entry.path)
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      skipNextBlurRef.current = true
      void commitRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      skipNextBlurRef.current = true
      setIsRenaming(false)
    }
  }

  function handleRenameBlur(): void {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false
      return
    }
    void commitRename()
  }

  async function confirmDelete(): Promise<void> {
    const result = await window.rasik.files.delete(entry.path)
    setIsDeleteDialogOpen(false)
    if (!result.ok) return

    closeFileByPath(entry.path)
    tree.refreshParentOf(entry.path)
  }

  async function copyPath(): Promise<void> {
    const absolutePath = workspaceRoot ? joinPath(workspaceRoot, entry.path) : entry.path
    await navigator.clipboard.writeText(absolutePath)
  }

  function revealInOS(): void {
    void window.rasik.shell.showItemInFolder(entry.path)
  }

  return (
    <div>
      <ContextMenu
        items={[
          { id: 'open-terminal-here', label: 'Open Terminal Here', onSelect: openTerminalHere },
          { id: 'rename', label: 'Rename', onSelect: startRename },
          { id: 'copy-path', label: 'Copy Path', onSelect: () => void copyPath() },
          { id: 'reveal-in-os', label: 'Reveal in OS', onSelect: revealInOS },
          { id: 'delete', label: 'Delete', danger: true, onSelect: () => setIsDeleteDialogOpen(true) },
        ]}
      >
        <div
          role="treeitem"
          aria-expanded={entry.isDirectory ? expanded : undefined}
          aria-selected={isActive}
          tabIndex={0}
          onClick={handleActivate}
          onKeyDown={handleKeyDown}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={[
            'flex cursor-pointer select-none items-center gap-1 py-0.5 pr-2 text-sm hover:bg-bg-overlay',
            isActive ? 'bg-bg-active text-text-primary' : 'text-text-primary',
          ].join(' ')}
        >
          {entry.isDirectory ? (
            expanded ? (
              <ChevronDown size={14} className="shrink-0 text-text-secondary" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-text-secondary" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Icon size={16} className="shrink-0" />
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onClick={(event: MouseEvent) => event.stopPropagation()}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
              className="min-w-0 flex-1 rounded border border-accent-primary bg-bg-input px-1 text-sm text-text-primary focus:outline-none"
            />
          ) : (
            <span
              className={`truncate ${gitDecoration ? STATUS_COLOR_CLASS[gitDecoration] : ''}`}
              title={gitDecoration ?? undefined}
            >
              {entry.name}
            </span>
          )}
          {loading && <Loader2 size={12} className="ml-auto shrink-0 animate-spin" />}
        </div>
      </ContextMenu>

      {entry.isDirectory && expanded && (
        <div>
          {(tree.childrenByPath[entry.path] ?? []).map((child) => (
            <FileTreeNode key={child.path} entry={child} depth={depth + 1} tree={tree} />
          ))}
        </div>
      )}

      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        title={`Delete ${entry.name}?`}
        description="This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">{entry.path}</p>
      </Dialog>
    </div>
  )
}
