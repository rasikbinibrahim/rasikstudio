import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { iconForEntry } from './file-icons'
import { ContextMenu, Dialog, Button } from '../../components/ui'
import { useAppStore } from '../../store'
import { dirname, joinPath } from '../../lib/path-utils'
import { FILE_PATH_DRAG_MIME_TYPE } from '../../lib/file-drag-mime'
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
  const renameInputRef = useRef<HTMLInputElement>(null)

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
    // The context menu closing after this selection returns focus to its trigger (this row) by
    // default — Radix's own `onCloseAutoFocus` behavior, undocumented here but real and
    // reproducible, not a test artifact (caught by this file's own test suite: the input mounted
    // with `autoFocus` but the very next blur, fired by that focus-return, immediately committed
    // the still-unchanged name and reverted out of rename mode before a user could type a single
    // character). Marking the next blur as spurious swallows exactly that one, expected event —
    // the effect below then takes real focus itself once Radix's own focus-return has settled.
    skipNextBlurRef.current = true
  }

  useEffect(() => {
    if (!isRenaming) return
    const id = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
      skipNextBlurRef.current = false
    })
    return () => cancelAnimationFrame(id)
  }, [isRenaming])

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
    if (!workspaceRoot) {
      await navigator.clipboard.writeText(entry.path)
      return
    }
    // `workspaceRoot` is an OS-native absolute path; `entry.path` is always `/`-separated
    // internally (matching the backend's own convention). `joinPath()` would produce a
    // mixed-separator path on Windows (`C:\Users\foo/src/App.tsx`) — join with the platform's
    // real separator instead.
    const separator = window.rasik.platform === 'win32' ? '\\' : '/'
    const absolutePath = [workspaceRoot, ...entry.path.split('/')].join(separator)
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
          draggable={!entry.isDirectory}
          onDragStart={
            entry.isDirectory
              ? undefined
              : (event) => event.dataTransfer.setData(FILE_PATH_DRAG_MIME_TYPE, entry.path)
          }
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
              ref={renameInputRef}
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
