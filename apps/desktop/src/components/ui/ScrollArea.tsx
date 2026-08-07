import type { ReactNode } from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

export interface ScrollAreaProps {
  children: ReactNode
  className?: string
}

export function ScrollArea({ children, className = '' }: ScrollAreaProps): JSX.Element {
  return (
    <ScrollAreaPrimitive.Root className={['overflow-hidden', className].join(' ')}>
      <ScrollAreaPrimitive.Viewport className="h-full w-full">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none bg-transparent p-0.5"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded bg-border-default" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}
