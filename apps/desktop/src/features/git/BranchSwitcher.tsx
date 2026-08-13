import { useEffect, useState } from 'react'
import { GitBranch as GitBranchIcon } from 'lucide-react'
import { useAppStore } from '../../store'
import { Dialog } from '../../components/ui/Dialog'

/** Reuses the existing `Dialog` primitive as a simple branch picker rather than adding a new
 *  dropdown-menu design-system component for one feature — no `@radix-ui/react-dropdown-menu`
 *  dependency, and it's the same "small overlay, click an item, close" shape `Dialog` already
 *  covers well. `GitService.branches()`/`checkoutBranch()` (Phase 12) already existed; this is
 *  the missing UI on top of them. */
export function BranchSwitcher(): JSX.Element {
  const [open, setOpen] = useState(false)
  const currentBranch = useAppStore((state) => state.gitStatus?.branch ?? null)
  const branches = useAppStore((state) => state.gitBranches)
  const refreshGitBranches = useAppStore((state) => state.refreshGitBranches)
  const checkoutBranch = useAppStore((state) => state.checkoutBranch)

  useEffect(() => {
    if (open) void refreshGitBranches()
  }, [open, refreshGitBranches])

  const localBranches = branches.filter((branch) => !branch.remote)
  const remoteBranches = branches.filter((branch) => branch.remote)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-bg-overlay"
        title="Switch branch"
      >
        <GitBranchIcon size={12} />
        <span className="truncate">{currentBranch ?? 'detached HEAD'}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Switch Branch" size="sm">
        {branches.length === 0 ? (
          <p className="text-sm text-text-secondary">No branches found.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {localBranches.length > 0 && (
              <BranchGroup
                label="Local"
                branches={localBranches}
                onSelect={(name) => {
                  void checkoutBranch(name)
                  setOpen(false)
                }}
              />
            )}
            {remoteBranches.length > 0 && (
              <BranchGroup
                label="Remote"
                branches={remoteBranches}
                onSelect={(name) => {
                  void checkoutBranch(name)
                  setOpen(false)
                }}
              />
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}

function BranchGroup({
  label,
  branches,
  onSelect,
}: {
  label: string
  branches: { name: string; current: boolean }[]
  onSelect: (name: string) => void
}): JSX.Element {
  return (
    <div className="mb-2">
      <div className="px-1 py-1 text-xs font-medium uppercase text-text-secondary">{label}</div>
      {branches.map((branch) => (
        <button
          key={branch.name}
          type="button"
          onClick={() => onSelect(branch.name)}
          disabled={branch.current}
          className={[
            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
            branch.current ? 'text-accent-primary' : 'text-text-primary hover:bg-bg-overlay',
          ].join(' ')}
        >
          <GitBranchIcon size={12} className="shrink-0" />
          <span className="truncate">{branch.name}</span>
          {branch.current && <span className="ml-auto text-xs text-text-secondary">current</span>}
        </button>
      ))}
    </div>
  )
}
