import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { GitFileEntry } from '../../types/git'
import { GitFileItem } from './GitFileItem'

export interface GitStatusSectionProps {
  title: string
  entries: GitFileEntry[]
  onOpenDiff: (path: string) => void
  onToggleStage: (path: string) => void
  toggleLabel: string
  onStageAll?: () => void
  stageAllLabel?: string
  defaultOpen?: boolean
}

export function GitStatusSection({
  title,
  entries,
  onOpenDiff,
  onToggleStage,
  toggleLabel,
  onStageAll,
  stageAllLabel,
  defaultOpen = true,
}: GitStatusSectionProps): JSX.Element | null {
  const [open, setOpen] = useState(defaultOpen)

  if (entries.length === 0) return null

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {title}
          <span className="font-normal normal-case text-text-secondary">({entries.length})</span>
        </button>
        {onStageAll && (
          <button
            type="button"
            onClick={onStageAll}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            {stageAllLabel}
          </button>
        )}
      </div>
      {open &&
        entries.map((entry) => (
          <GitFileItem
            key={entry.path}
            entry={entry}
            onOpenDiff={() => onOpenDiff(entry.path)}
            onToggleStage={() => onToggleStage(entry.path)}
            toggleLabel={toggleLabel}
          />
        ))}
    </div>
  )
}
