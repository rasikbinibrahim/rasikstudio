import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { ContainerItem } from './ContainerItem'

export function ContainerList(): JSX.Element {
  const containers = useAppStore((state) => state.dockerContainers)
  const selectedId = useAppStore((state) => state.dockerSelectedContainerId)
  const selectContainer = useAppStore((state) => state.selectContainer)
  const startContainer = useAppStore((state) => state.startContainer)
  const stopContainer = useAppStore((state) => state.stopContainer)
  const restartContainer = useAppStore((state) => state.restartContainer)
  const removeContainer = useAppStore((state) => state.removeContainer)
  const openContainerShell = useAppStore((state) => state.openContainerShell)

  if (containers.length === 0) {
    return <EmptyState message="No containers found." />
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {containers.map((container) => (
        <ContainerItem
          key={container.id}
          container={container}
          selected={container.id === selectedId}
          onSelect={() => selectContainer(container.id === selectedId ? null : container.id)}
          onStart={() => void startContainer(container.id)}
          onStop={() => void stopContainer(container.id)}
          onRestart={() => void restartContainer(container.id)}
          onRemove={() => void removeContainer(container.id)}
          onOpenShell={() => void openContainerShell(container.id, container.name)}
        />
      ))}
    </div>
  )
}
