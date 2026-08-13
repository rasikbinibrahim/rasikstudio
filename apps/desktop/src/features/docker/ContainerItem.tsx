import { Play, RotateCw, Square, Terminal as TerminalIcon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Dialog } from '../../components/ui'
import type { DockerContainer } from '../../types/docker'

export interface ContainerItemProps {
  container: DockerContainer
  selected: boolean
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onOpenShell: () => void
  onRemove: () => void
}

const stateDotClasses: Record<DockerContainer['state'], string> = {
  running: 'bg-status-success',
  restarting: 'bg-status-warning',
  paused: 'bg-status-warning',
  exited: 'bg-text-secondary',
  created: 'bg-text-secondary',
  dead: 'bg-status-error',
  removing: 'bg-status-error',
  unknown: 'bg-text-secondary',
}

export function ContainerItem({
  container,
  selected,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onOpenShell,
  onRemove,
}: ContainerItemProps): JSX.Element {
  const running = container.state === 'running'
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect()
      }}
      className={[
        'flex cursor-pointer items-center gap-2 border-b border-border-subtle px-3 py-2 text-xs hover:bg-bg-overlay',
        selected ? 'bg-bg-active' : '',
      ].join(' ')}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${stateDotClasses[container.state]}`}
        aria-label={container.state}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text-primary">{container.name}</div>
        <div className="truncate text-text-secondary">
          {container.image} — {container.status}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {running ? (
          <button
            type="button"
            aria-label="Stop"
            title="Stop"
            onClick={(event) => {
              event.stopPropagation()
              onStop()
            }}
            className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Start"
            title="Start"
            onClick={(event) => {
              event.stopPropagation()
              onStart()
            }}
            className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <Play size={14} />
          </button>
        )}
        <button
          type="button"
          aria-label="Restart"
          title="Restart"
          onClick={(event) => {
            event.stopPropagation()
            onRestart()
          }}
          className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
        >
          <RotateCw size={14} />
        </button>
        {running && (
          <button
            type="button"
            aria-label="Open shell"
            title="Open shell"
            onClick={(event) => {
              event.stopPropagation()
              onOpenShell()
            }}
            className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <TerminalIcon size={14} />
          </button>
        )}
        <button
          type="button"
          aria-label="Remove"
          title="Remove"
          onClick={(event) => {
            event.stopPropagation()
            setIsRemoveDialogOpen(true)
          }}
          className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-status-error"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <Dialog
        open={isRemoveDialogOpen}
        onClose={() => setIsRemoveDialogOpen(false)}
        title={`Remove ${container.name}?`}
        description={
          running
            ? 'This container is still running — it will be stopped and removed. This cannot be undone.'
            : 'This cannot be undone.'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                setIsRemoveDialogOpen(false)
                onRemove()
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">{container.image}</p>
      </Dialog>
    </div>
  )
}
