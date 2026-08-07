import { useState } from 'react'

export type PaletteMode = 'files' | 'commands'

export interface UseCommandPaletteResult {
  open: boolean
  query: string
  mode: PaletteMode
  openPalette: (mode: PaletteMode) => void
  closePalette: () => void
  setQuery: (query: string) => void
}

/** `>` prefix switches the palette into command mode, matching the VS Code convention this
 *  project's docs cite as a reference — the same overlay serves both Ctrl+P and Ctrl+Shift+P. */
export function useCommandPalette(): UseCommandPaletteResult {
  const [open, setOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [mode, setMode] = useState<PaletteMode>('files')

  function openPalette(nextMode: PaletteMode): void {
    setMode(nextMode)
    setQueryState(nextMode === 'commands' ? '>' : '')
    setOpen(true)
  }

  function closePalette(): void {
    setOpen(false)
    setQueryState('')
  }

  function setQuery(nextQuery: string): void {
    setQueryState(nextQuery)
    setMode(nextQuery.startsWith('>') ? 'commands' : 'files')
  }

  return { open, query, mode, openPalette, closePalette, setQuery }
}
