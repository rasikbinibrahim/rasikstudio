import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, Settings } from 'lucide-react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'

export interface ModelPickerOption {
  id: string
  label: string
  provider: string
  /** Live availability from `GET /api/v1/models` — not a static property of the model id. */
  available: boolean
}

export interface ModelPickerProps {
  options: ModelPickerOption[]
  value: string
  onChange: (id: string) => void
  onManageModels: () => void
  className?: string
}

/** Searchable model dropdown shared by `ChatSessionList` and `AgentTaskList` — replaces a raw
 *  `<select>` with grouped-by-provider options, a checkmark on the current selection, and a
 *  small "Not configured" tag on models the live availability check reports as unreachable
 *  (no API key / not yet pulled), rather than leaving them indistinguishable from usable ones. */
export function ModelPicker({ options, value, onChange, onManageModels, className = '' }: ModelPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const current = options.find((o) => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? options.filter((o) => o.id.toLowerCase().includes(q) || o.provider.toLowerCase().includes(q))
      : options
    return [...matches].sort((a, b) => Number(b.available) - Number(a.available))
  }, [options, query])

  function handleOpenChange(next: boolean): void {
    setOpen(next)
    if (!next) setQuery('')
  }

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className={[
            'flex items-center gap-1.5 truncate rounded border border-border-default bg-bg-input px-2 py-1',
            'text-xs text-text-primary hover:bg-bg-overlay focus:outline-none focus:ring-2 focus:ring-accent-primary',
            className,
          ].join(' ')}
        >
          <span className="truncate">{current?.label ?? value}</span>
          <ChevronDown size={12} className="shrink-0 text-text-secondary" />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 flex w-72 flex-col rounded-md border border-border-subtle bg-bg-elevated shadow-lg"
        >
          <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
            <Search size={12} className="shrink-0 text-text-secondary" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search models…"
              className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-secondary focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-text-secondary">No models match &ldquo;{query}&rdquo;</div>
            )}
            {filtered.map((option) => (
              <DropdownMenuPrimitive.Item
                key={option.id}
                onSelect={() => onChange(option.id)}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none',
                  'data-[highlighted]:bg-bg-overlay',
                  option.available ? 'text-text-primary' : 'text-text-secondary',
                ].join(' ')}
              >
                <Check size={12} className={option.id === value ? 'shrink-0 text-accent-primary' : 'shrink-0 opacity-0'} />
                <span className="flex-1 truncate">{option.label}</span>
                {!option.available && (
                  <span className="shrink-0 rounded bg-bg-overlay px-1.5 py-0.5 text-[10px] text-text-secondary">
                    Not configured
                  </span>
                )}
              </DropdownMenuPrimitive.Item>
            ))}
          </div>
          <DropdownMenuPrimitive.Item
            onSelect={onManageModels}
            className="flex cursor-pointer items-center gap-1.5 border-t border-border-subtle px-2 py-1.5 text-xs text-text-secondary outline-none data-[highlighted]:bg-bg-overlay data-[highlighted]:text-text-primary"
          >
            <Settings size={12} />
            Manage Models…
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
