import type { ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export interface TooltipProps {
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  children: ReactNode
}

export function Tooltip({ content, side = 'top', delay = 500, children }: TooltipProps): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded border border-border-subtle bg-bg-elevated px-2 py-1 text-xs text-text-primary shadow-md"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-bg-elevated" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
