import { TerminalTabBar } from './TerminalTabBar'
import { TerminalTab } from './TerminalTab'
import { useAppStore } from '../../store'

export function TerminalPanel(): JSX.Element {
  const terminals = useAppStore((state) => state.terminals)
  const activeTerminalId = useAppStore((state) => state.activeTerminalId)

  return (
    <div className="flex h-full flex-col bg-bg-base">
      <TerminalTabBar />
      <div className="relative flex-1">
        {terminals.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">
            No terminal open — click + to start one
          </div>
        )}
        {terminals.map((terminal) => (
          <TerminalTab key={terminal.id} terminalId={terminal.id} visible={terminal.id === activeTerminalId} />
        ))}
      </div>
    </div>
  )
}
