import type { ReactNode } from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'

export interface ContextMenuItem {
  id: string
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  children: ReactNode
}

export function ContextMenu({ items, children }: ContextMenuProps): JSX.Element {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className="z-50 min-w-[160px] rounded-md border border-border-subtle bg-bg-elevated p-1 shadow-lg">
          {items.map((item) => (
            <ContextMenuPrimitive.Item
              key={item.id}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={[
                'cursor-pointer rounded px-2 py-1.5 text-sm outline-none',
                'data-[highlighted]:bg-bg-overlay',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                item.danger ? 'text-status-error' : 'text-text-primary',
              ].join(' ')}
            >
              {item.label}
            </ContextMenuPrimitive.Item>
          ))}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}
