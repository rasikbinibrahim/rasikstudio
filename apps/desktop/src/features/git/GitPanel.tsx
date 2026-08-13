import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, History } from 'lucide-react'
import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { GitStatusSection } from './GitStatusSection'
import { CommitPanel } from './CommitPanel'
import { DiffViewer } from './DiffViewer'
import { ConflictResolver } from './ConflictResolver'
import { BranchSwitcher } from './BranchSwitcher'
import { CommitLog } from './CommitLog'

export function GitPanel(): JSX.Element {
  const [showLog, setShowLog] = useState(false)
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const status = useAppStore((state) => state.gitStatus)
  const statusError = useAppStore((state) => state.gitStatusError)
  const diffTarget = useAppStore((state) => state.gitDiffTarget)
  const refreshGitStatus = useAppStore((state) => state.refreshGitStatus)
  const stageFiles = useAppStore((state) => state.stageFiles)
  const unstageFiles = useAppStore((state) => state.unstageFiles)
  const openDiff = useAppStore((state) => state.openDiff)
  const push = useAppStore((state) => state.push)
  const pull = useAppStore((state) => state.pull)
  const pushing = useAppStore((state) => state.gitPushing)
  const pulling = useAppStore((state) => state.gitPulling)
  const pushPullMessage = useAppStore((state) => state.gitPushPullMessage)
  const pushPullError = useAppStore((state) => state.gitPushPullError)

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

  if (showLog) {
    return <CommitLog onClose={() => setShowLog(false)} />
  }

  const isEmpty =
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicted.length === 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5 text-xs text-text-secondary">
        <BranchSwitcher />
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="shrink-0">
            {status.ahead > 0 && `↑${status.ahead}`}
            {status.behind > 0 && `↓${status.behind}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowDown size={12} />}
            loading={pulling}
            onClick={() => void pull()}
            title="Pull"
          >
            Pull
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowUp size={12} />}
            loading={pushing}
            onClick={() => void push()}
            title="Push"
          >
            Push
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<History size={12} />}
            onClick={() => setShowLog(true)}
            title="History"
          >
            History
          </Button>
        </div>
      </div>
      {(pushPullMessage || pushPullError) && (
        <div
          className={[
            'border-b border-border-subtle px-3 py-1.5 text-xs',
            pushPullError ? 'text-status-error' : 'text-text-secondary',
          ].join(' ')}
        >
          {pushPullError ?? pushPullMessage}
        </div>
      )}
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
