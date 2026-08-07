import type { ReactNode } from 'react'

export interface BottomPanelProps {
  children: ReactNode
}

/** Generic collapsible-bottom-panel chrome (terminal today; problems/output panels later share
 *  this same slot). Content is slotted in by the composition root, same rule as `LeftSidebar`. */
export function BottomPanel({ children }: BottomPanelProps): JSX.Element {
  return <div className="flex h-full flex-col overflow-hidden border-t border-border-subtle bg-bg-base">{children}</div>
}
