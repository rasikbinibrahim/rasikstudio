import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { File, Terminal as CommandIcon } from 'lucide-react'
import { Dialog, Input, ScrollArea } from '../../components/ui'
import { fuzzyFilter } from '../../lib/fuzzy-match'
import { commandRegistry } from './CommandRegistry'
import { useAppStore } from '../../store'
import type { PaletteMode } from './useCommandPalette'

export interface CommandPaletteProps {
  open: boolean
  mode: PaletteMode
  query: string
  onQueryChange: (query: string) => void
  onClose: () => void
}

export function CommandPalette({
  open,
  mode,
  query,
  onQueryChange,
  onClose,
}: CommandPaletteProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const allFiles = useAppStore((state) => state.allFiles)
  const openFile = useAppStore((state) => state.openFile)

  // In command mode the leading `>` is the mode switch, not part of the search term.
  const searchTerm = mode === 'commands' ? query.slice(1) : query

  const fileResults = useMemo(
    () => (mode === 'files' ? fuzzyFilter(searchTerm, allFiles, (path) => path).slice(0, 50) : []),
    [mode, searchTerm, allFiles],
  )

  const commandResults = useMemo(
    () =>
      mode === 'commands'
        ? fuzzyFilter(searchTerm, commandRegistry.getAll(), (command) => command.title)
        : [],
    [mode, searchTerm],
  )

  const resultCount = mode === 'files' ? fileResults.length : commandResults.length

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, mode])

  function selectAt(index: number): void {
    if (mode === 'files') {
      const path = fileResults[index]
      if (path) {
        void openFile(path)
        onClose()
      }
      return
    }

    const command = commandResults[index]
    if (command) {
      void commandRegistry.execute(command.id)
      onClose()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => Math.min(index + 1, Math.max(resultCount - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectAt(selectedIndex)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'commands' ? 'Command Palette' : 'Quick Open'}>
      <Input
        autoFocus
        value={query}
        onChange={onQueryChange}
        onKeyDown={handleKeyDown}
        placeholder={mode === 'commands' ? 'Type a command…' : 'Search files by name…'}
      />
      <ScrollArea className="mt-2 max-h-80">
        <div role="listbox" aria-label={mode === 'commands' ? 'Commands' : 'Files'} className="flex flex-col gap-0.5">
          {mode === 'files'
            ? fileResults.map((path, index) => (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectAt(index)}
                  className={[
                    'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                    index === selectedIndex
                      ? 'bg-bg-active text-text-primary'
                      : 'text-text-primary hover:bg-bg-overlay',
                  ].join(' ')}
                >
                  <File size={14} className="shrink-0 text-text-secondary" />
                  <span className="truncate">{path}</span>
                </button>
              ))
            : commandResults.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectAt(index)}
                  className={[
                    'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm',
                    index === selectedIndex
                      ? 'bg-bg-active text-text-primary'
                      : 'text-text-primary hover:bg-bg-overlay',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2 truncate">
                    <CommandIcon size={14} className="shrink-0 text-text-secondary" />
                    {command.title}
                  </span>
                  {command.keybinding && (
                    <span className="text-xs text-text-secondary">{command.keybinding}</span>
                  )}
                </button>
              ))}
          {resultCount === 0 && (
            <p className="px-2 py-4 text-center text-sm text-text-secondary">No results</p>
          )}
        </div>
      </ScrollArea>
    </Dialog>
  )
}
