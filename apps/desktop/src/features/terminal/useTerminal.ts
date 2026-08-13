import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useAppStore } from '../../store'
import '@xterm/xterm/css/xterm.css'

export interface UseTerminalResult {
  containerRef: RefObject<HTMLDivElement>
  /** Wraps the real `SearchAddon` loaded below — previously loaded but never reachable from any
   *  UI (`docs/reference/xterm/ADDON_NOTES.md` named this real, previously-untracked gap). No-ops
   *  before the terminal has actually mounted (`termRef.current` briefly null on first render). */
  findNext: (query: string) => boolean
  findPrevious: (query: string) => boolean
}

/** Creates one persistent xterm.js instance for the given PTY session, attaches it to a DOM
 *  container, and wires input/output/resize over IPC. The instance lives for as long as the
 *  component stays mounted — callers keep every tab's `TerminalTab` mounted (just hidden) so
 *  switching tabs doesn't lose scrollback, matching how the Monaco editor reuses models. */
export function useTerminal(terminalId: string): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const markTerminalExited = useAppStore((state) => state.markTerminalExited)
  const renameTerminal = useAppStore((state) => state.renameTerminal)

  useEffect(() => {
    if (!containerRef.current || termRef.current) return
    const container = containerRef.current

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10_000,
      allowProposedApi: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#cccccc',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'

    term.open(container)

    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL unavailable (headless, no GPU, etc.) — xterm falls back to its default DOM renderer.
    }

    fitAddon.fit()
    termRef.current = term

    // E2E test hook (`tests/e2e/fixtures/electron-app.ts`'s `readTerminalText()`) — the WebGL
    // renderer (loaded just above) draws to `<canvas>`, not DOM text nodes, so there is no
    // reliable text content for a test to read from the rendered DOM. `term.buffer.active` is
    // the same real screen-buffer xterm.js itself uses; reading it here is not a special
    // test-only code path, just the same object a real accessibility tree would also read from.
    window.__rasikTerminals ??= new Map()
    window.__rasikTerminals.set(terminalId, term)

    term.onData((data) => {
      window.rasik.terminal.write(terminalId, data)
    })

    const unsubscribeData = window.rasik.terminal.onData(terminalId, (data) => {
      term.write(data)
    })

    const unsubscribeExit = window.rasik.terminal.onExit(terminalId, () => {
      markTerminalExited(terminalId)
    })

    // OSC-0/OSC-2: shells and interactive programs (vim, ssh, git) set this to reflect what's
    // currently running, so the tab title tracks it instead of staying pinned to the launch cwd.
    const titleDisposable = term.onTitleChange((title) => {
      renameTerminal(terminalId, title)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      window.rasik.terminal.resize(terminalId, term.cols, term.rows)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      unsubscribeData()
      unsubscribeExit()
      titleDisposable.dispose()
      window.__rasikTerminals?.delete(terminalId)
      term.dispose()
      termRef.current = null
      searchAddonRef.current = null
    }
  }, [terminalId, markTerminalExited, renameTerminal])

  return {
    containerRef,
    findNext: (query) => (query ? (searchAddonRef.current?.findNext(query) ?? false) : false),
    findPrevious: (query) => (query ? (searchAddonRef.current?.findPrevious(query) ?? false) : false),
  }
}
