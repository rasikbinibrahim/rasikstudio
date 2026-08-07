import { useEffect } from 'react'
import { GitBranch as GitBranchIcon } from 'lucide-react'
import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { GitStatusSection } from './GitStatusSection'
import { CommitPanel } from './CommitPanel'
import { DiffViewer } from './DiffViewer'
import { ConflictResolver } from './ConflictResolver'

export function GitPanel(): JSX.Element {
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const status = useAppStore((state) => state.gitStatus)
  const statusError = useAppStore((state) => state.gitStatusError)
  const diffTarget = useAppStore((state) => state.gitDiffTarget)
  const refreshGitStatus = useAppStore((state) => state.refreshGitStatus)
  const stageFiles = useAppStore((state) => state.stageFiles)
  const unstageFiles = useAppStore((state) => state.unstageFiles)
  const openDiff = useAppStore((state) => state.openDiff)

  useEffect(() => {
    if (workspaceRoot) void refreshGitStatus()
  }, [workspaceRoot, refreshGitStatus])

  if (!workspaceRoot) {
    return <EmptyState message="Open a folder first — Git status is per-workspace." />
  }

  if (!status) {
    return (
      <EmptyState message={statusError ? 'Not a git repository.' : 'Loading git status…'}>
        {statusError && (
          <button
            type="button"
            onClick={() => void refreshGitStatus()}
            className="text-xs text-accent-primary hover:underline"
          >
            Retry
          </button>
        )}
      </EmptyState>
    )
  }

  const conflictedPath = status.conflicted[0]?.path
  if (conflictedPath) {
    return <ConflictResolver path={conflictedPath} />
  }

  if (diffTarget) {
    return <DiffViewer />
  }

  const isEmpty =
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicted.length === 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5 text-xs text-text-secondary">
        <GitBranchIcon size={12} />
        <span className="truncate">{status.branch ?? 'detached HEAD'}</span>
        {(status.ahead > 0 || status.behind > 0) && (
          <span>
            {status.ahead > 0 && `↑${status.ahead}`}
            {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState message="No changes." />
        ) : (
          <>
            <GitStatusSection
              title="Staged"
              entries={status.staged}
              onOpenDiff={(path) => openDiff(path, true)}
              onToggleStage={(path) => void unstageFiles([path])}
              toggleLabel="−"
            />
            <GitStatusSection
              title="Unstaged"
              entries={status.unstaged}
              onOpenDiff={(path) => openDiff(path, false)}
              onToggleStage={(path) => void stageFiles([path])}
              toggleLabel="+"
              onStageAll={() => void stageFiles(status.unstaged.map((entry) => entry.path))}
              stageAllLabel="Stage All"
            />
            <GitStatusSection
              title="Untracked"
              entries={status.untracked}
              onOpenDiff={(path) => openDiff(path, false)}
              onToggleStage={(path) => void stageFiles([path])}
              toggleLabel="+"
              onStageAll={() => void stageFiles(status.untracked.map((entry) => entry.path))}
              stageAllLabel="Stage All"
            />
          </>
        )}
      </div>
      <CommitPanel />
    </div>
  )
}
