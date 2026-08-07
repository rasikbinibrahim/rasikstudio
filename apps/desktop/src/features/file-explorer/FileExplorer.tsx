import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui'
import { useAppStore } from '../../store'
import { FileTree } from './FileTree'

export function FileExplorer(): JSX.Element {
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const workspaceName = useAppStore((state) => state.workspaceName)
  const openFolder = useAppStore((state) => state.openFolder)
  const openFolderAtPath = useAppStore((state) => state.openFolderAtPath)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  if (!workspaceRoot) {
    // Only a directory drop makes sense here — `getPathForFile` still resolves for a dropped
    // *file*, but handing that to `workspace:openPath` would just fail its is-a-directory check,
    // so this is a graceful no-op for that case rather than a special error path.
    const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
      event.preventDefault()
      setIsDraggingOver(false)
      const file = event.dataTransfer.files[0]
      if (!file) return
      const path = window.rasik.workspace.getPathForFile(file)
      void openFolderAtPath(path)
    }

    return (
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDraggingOver(true)
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`flex h-full flex-col items-center justify-center gap-3 p-4 text-center transition-colors ${
          isDraggingOver ? 'bg-bg-active' : ''
        }`}
      >
        <p className="text-sm text-text-secondary">
          {isDraggingOver ? 'Drop to open this folder' : 'No folder opened'}
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<FolderOpen size={16} />}
          onClick={() => void openFolder()}
        >
          Open Folder
        </Button>
        {!isDraggingOver && (
          <p className="text-xs text-text-secondary">or drag a folder here</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        <span className="truncate">{workspaceName}</span>
      </div>
      <FileTree />
    </div>
  )
}
