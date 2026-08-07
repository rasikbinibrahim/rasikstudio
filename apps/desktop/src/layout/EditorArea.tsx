import type { ReactNode } from 'react'

export interface EditorAreaProps {
  children: ReactNode
}

export function EditorArea({ children }: EditorAreaProps): JSX.Element {
  return <div className="flex h-full min-w-0 flex-col bg-bg-base">{children}</div>
}
