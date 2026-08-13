import { useState, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import { useTerminal } from './useTerminal'

export interface TerminalTabProps {
  terminalId: string
  visible: boolean
}

/** Stays mounted even when not the active tab — only visibility (via `display`) changes — so
 *  the underlying xterm.js instance and its scrollback survive switching tabs. */
export function TerminalTab({ terminalId, visible }: TerminalTabProps): JSX.Element {
  const { containerRef, findNext, findPrevious } = useTerminal(terminalId)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      setSearchOpen(true)
      return
    }
    if (searchOpen && event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
    }
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ display: visible ? 'block' : 'none' }}
      onKeyDown={handleKeyDown}
    >
      {searchOpen && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-border-subtle bg-bg-elevated p-1 shadow-lg">
          <Search size={12} className="ml-1 text-text-secondary" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.shiftKey) findPrevious(query)
                else findNext(query)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                closeSearch()
              }
            }}
            placeholder="Find in terminal"
            className="w-40 bg-transparent px-1 py-0.5 text-xs text-text-primary outline-none placeholder:text-text-secondary"
          />
          <button
            type="button"
            aria-label="Close search"
            title="Close search"
            onClick={closeSearch}
            className="rounded p-0.5 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full p-1" />
    </div>
  )
}
