import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'

export interface CommitLogProps {
  onClose: () => void
}

/** `GitService.log()` (Phase 12) already existed and was tested — nothing in the UI called it
 *  until now. Same full-panel-swap pattern `DiffViewer`/`ConflictResolver` use, rather than a
 *  new global store field like `gitDiffTarget` — nothing outside `GitPanel.tsx` needs to open
 *  this view. */
export function CommitLog({ onClose }: CommitLogProps): JSX.Element {
  const log = useAppStore((state) => state.gitLog)
  const loading = useAppStore((state) => state.gitLogLoading)
  const refreshGitLog = useAppStore((state) => state.refreshGitLog)

  useEffect(() => {
    void refreshGitLog()
  }, [refreshGitLog])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1.5">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onClose}>
          Back
        </Button>
        <span className="text-xs text-text-secondary">History</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && log.length === 0 ? (
          <EmptyState message="Loading history…" />
        ) : log.length === 0 ? (
          <EmptyState message="No commits yet." />
        ) : (
          <ul>
            {log.map((entry) => (
              <li
                key={entry.hash}
                className="flex items-start gap-2 border-b border-border-subtle px-3 py-2 text-sm"
              >
                <code className="shrink-0 font-mono text-xs text-text-secondary">
                  {entry.hash.slice(0, 7)}
                </code>
                <span className="truncate text-text-primary">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
