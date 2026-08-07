import { Bot, Container, Files, GitBranch, Globe, MessageSquare } from 'lucide-react'
import { useAppStore } from '../store'
import type { SidebarView } from '../store/ui-slice'

const ITEMS: { view: SidebarView; label: string; icon: typeof Files }[] = [
  { view: 'explorer', label: 'Explorer', icon: Files },
  { view: 'git', label: 'Source Control', icon: GitBranch },
  { view: 'chat', label: 'AI Chat', icon: MessageSquare },
  { view: 'agents', label: 'Agent Tasks', icon: Bot },
  { view: 'browser', label: 'Browser', icon: Globe },
  { view: 'docker', label: 'Docker', icon: Container },
]

export function ActivityBar(): JSX.Element {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const activeSidebarView = useAppStore((state) => state.activeSidebarView)
  const setSidebarView = useAppStore((state) => state.setSidebarView)

  return (
    <div className="flex w-12 shrink-0 flex-col items-center border-r border-border-subtle bg-bg-panel py-2">
      {ITEMS.map(({ view, label, icon: Icon }) => {
        const active = !sidebarCollapsed && activeSidebarView === view
        return (
          <button
            key={view}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => setSidebarView(view)}
            className={[
              'flex h-11 w-11 items-center justify-center rounded',
              active ? 'bg-bg-active text-text-primary' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            <Icon size={24} strokeWidth={1.5} />
          </button>
        )
      })}
    </div>
  )
}
