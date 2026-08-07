import type { ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  children?: ReactNode
}

/** Centered placeholder message for a panel with nothing to show yet — not signed in, no
 *  workspace open, no items created. Extracted after `ChatPanel.tsx` and `AgentPanel.tsx` each
 *  defined the identical thing locally (Phase 10 / Phase 8 desktop UI). */
export function EmptyState({ message, children }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-text-secondary">
      <span>{message}</span>
      {children}
    </div>
  )
}
