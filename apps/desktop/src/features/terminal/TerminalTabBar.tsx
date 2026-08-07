import { Plus } from 'lucide-react'
import { Tabs } from '../../components/ui'
import { useAppStore } from '../../store'

export function TerminalTabBar(): JSX.Element {
  const terminals = useAppStore((state) => state.terminals)
  const activeTerminalId = useAppStore((state) => state.activeTerminalId)
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal)
  const closeTerminal = useAppStore((state) => state.closeTerminal)
  const createTerminal = useAppStore((state) => state.createTerminal)

  return (
    <div className="flex items-stretch border-b border-border-subtle bg-bg-panel">
      <div className="min-w-0 flex-1">
        <Tabs
          tabs={terminals.map((terminal) => ({
            id: terminal.id,
            label: terminal.status === 'exited' ? `${terminal.title} (exited)` : terminal.title,
            closeable: true,
          }))}
          activeId={activeTerminalId}
          onTabChange={setActiveTerminal}
          onTabClose={closeTerminal}
        />
      </div>
      <button
        type="button"
        aria-label="New Terminal"
        onClick={() => void createTerminal()}
        className="flex w-9 items-center justify-center text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
