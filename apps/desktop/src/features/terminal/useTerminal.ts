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
}

/** Creates one persistent xterm.js instance for the given PTY session, attaches it to a DOM
 *  container, and wires input/output/resize over IPC. The instance lives for as long as the
 *  component stays mounted — callers keep every tab's `TerminalTab` mounted (just hidden) so
 *  switching tabs doesn't lose scrollback, matching how the Monaco editor reuses models. */
export function useTerminal(terminalId: string): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
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
    term.loadAddon(new SearchAddon())
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
      term.dispose()
      termRef.current = null
    }
  }, [terminalId, markTerminalExited, renameTerminal])

  return { containerRef }
}
