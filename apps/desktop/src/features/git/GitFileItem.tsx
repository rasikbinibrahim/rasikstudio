import type { GitFileEntry } from '../../types/git'
import { STATUS_COLOR_CLASS, STATUS_LETTER } from './git-status-display'

export interface GitFileItemProps {
  entry: GitFileEntry
  onOpenDiff: () => void
  onToggleStage: () => void
  toggleLabel: string
}

export function GitFileItem({ entry, onOpenDiff, onToggleStage, toggleLabel }: GitFileItemProps): JSX.Element {
  return (
    <div className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-active">
      <button
        type="button"
        onClick={onOpenDiff}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={`w-3 shrink-0 text-center font-semibold ${STATUS_COLOR_CLASS[entry.status]}`}>
          {STATUS_LETTER[entry.status]}
        </span>
        <span className="truncate text-text-primary" title={entry.path}>
          {entry.path}
        </span>
        {entry.origPath && (
          <span className="truncate text-text-secondary" title={entry.origPath}>
            ← {entry.origPath}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleStage}
        className="shrink-0 rounded px-1.5 py-0.5 text-text-secondary opacity-0 hover:bg-bg-overlay hover:text-text-primary group-hover:opacity-100"
      >
        {toggleLabel}
      </button>
    </div>
  )
}
