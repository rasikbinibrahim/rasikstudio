import type { KeyboardEvent, ReactNode } from 'react'
import { X } from 'lucide-react'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  closeable?: boolean
}

export interface TabsProps {
  tabs: TabItem[]
  activeId: string | null
  onTabChange: (id: string) => void
  onTabClose?: (id: string) => void
}

export function Tabs({ tabs, activeId, onTabChange, onTabClose }: TabsProps): JSX.Element {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onTabChange(id)
    }
  }

  return (
    <div
      role="tablist"
      className="flex h-9 items-stretch overflow-x-auto border-b border-border-subtle bg-bg-panel"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            className={[
              'group flex cursor-pointer select-none items-center gap-2 border-r border-border-subtle px-3 text-sm',
              active
                ? 'bg-bg-base text-text-primary'
                : 'bg-bg-panel text-text-secondary hover:bg-bg-overlay',
            ].join(' ')}
          >
            {tab.icon}
            <span className="max-w-[160px] truncate">{tab.label}</span>
            {tab.closeable && (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onTabClose?.(tab.id)
                }}
                className="ml-1 rounded p-0.5 opacity-0 hover:bg-bg-overlay group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
