import { useEffect } from 'react'
import { Container as ContainerIcon, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { ContainerList } from './ContainerList'
import { ContainerLogs } from './ContainerLogs'

export function DockerPanel(): JSX.Element {
  const containers = useAppStore((state) => state.dockerContainers)
  const loading = useAppStore((state) => state.dockerContainersLoading)
  const error = useAppStore((state) => state.dockerContainersError)
  const selectedId = useAppStore((state) => state.dockerSelectedContainerId)
  const refreshContainers = useAppStore((state) => state.refreshContainers)

  // Unlike Git/Browser, Docker isn't workspace-scoped — the daemon and its containers exist
  // independently of which folder is open, so this refreshes once on mount rather than gating on
  // `workspaceRoot`.
  useEffect(() => {
    void refreshContainers()
  }, [refreshContainers])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <ContainerIcon size={12} />
          Containers
        </span>
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => void refreshContainers()}
          className="rounded p-1 hover:bg-bg-overlay hover:text-text-primary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {containers.length === 0 ? (
        <EmptyState
          message={
            error
              ? 'Docker CLI not found or the daemon is not running.'
              : loading
                ? 'Loading containers…'
                : 'No containers found.'
          }
        />
      ) : (
        <ContainerList />
      )}
      {selectedId && <ContainerLogs containerId={selectedId} />}
    </div>
  )
}
