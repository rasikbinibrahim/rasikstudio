import type { ReactNode } from 'react'

export interface LeftSidebarProps {
  children: ReactNode
}

/** Generic resizable-left-panel chrome. Content is slotted in by the composition root (App.tsx) — never imported from features/ directly, since which feature fills this slot depends on the active ActivityBar item. */
export function LeftSidebar({ children }: LeftSidebarProps): JSX.Element {
  return <div className="flex h-full flex-col overflow-hidden bg-bg-panel">{children}</div>
}
