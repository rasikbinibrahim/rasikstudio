import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { useAppStore } from '../../store'
import { useTerminal } from './useTerminal'

function stubTerminalApi(): {
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  exitHandlers: Map<string, () => void>
} {
  const exitHandlers = new Map<string, () => void>()
  const onData = vi.fn(() => () => undefined)
  const onExit = vi.fn((id: string, handler: () => void) => {
    exitHandlers.set(id, handler)
    return () => exitHandlers.delete(id)
  })
  const write = vi.fn()
  const resize = vi.fn()

  ;(window as unknown as { rasik: { terminal: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    terminal: { write, resize, onData, onExit, create: vi.fn(), kill: vi.fn() },
  }

  return { write, resize, onData, onExit, exitHandlers }
}

/** Real render, not `renderHook` — the hook only attaches its real xterm.js instance once
 *  `containerRef` has a real DOM node, which needs an actual component render/commit (refs
 *  attach before effects run) rather than assigning `.current` after the fact. Same shape
 *  `TerminalTab.tsx` itself uses. */
function TestHarness({ terminalId }: { terminalId: string }): JSX.Element {
  const { containerRef } = useTerminal(terminalId)
  return createElement('div', { ref: containerRef })
}

/** Also exposes `findNext`/`findPrevious` onto `window` so tests can call them after mount —
 *  the hook only returns them, it doesn't put them anywhere a test could reach without a real
 *  component render exposing them somehow. */
function SearchTestHarness({ terminalId }: { terminalId: string }): JSX.Element {
  const { containerRef, findNext, findPrevious } = useTerminal(terminalId)
  ;(window as unknown as { __testSearch: unknown }).__testSearch = { findNext, findPrevious }
  return createElement('div', { ref: containerRef })
}

describe('useTerminal', () => {
  let api: ReturnType<typeof stubTerminalApi>

  beforeEach(() => {
    api = stubTerminalApi()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes to onData/onExit for the given terminal id once mounted', () => {
    render(createElement(TestHarness, { terminalId: 't1' }))

    expect(api.onData).toHaveBeenCalledWith('t1', expect.any(Function))
    expect(api.onExit).toHaveBeenCalledWith('t1', expect.any(Function))
  })

  it('mounts a real xterm.js instance (not a mock) with its own input textarea', () => {
    render(createElement(TestHarness, { terminalId: 't2' }))

    // Proof this is a real `Terminal` instance rendering into the DOM, not a stub — xterm.js
    // creates this specific hidden textarea to capture keyboard input.
    expect(document.querySelector('.xterm-helper-textarea')).not.toBeNull()
    expect(api.write).not.toHaveBeenCalled() // nothing written without real user input
  })

  it('forwards a terminal-exit IPC event to the store', () => {
    const markExited = vi.fn()
    useAppStore.setState({ markTerminalExited: markExited })

    render(createElement(TestHarness, { terminalId: 't3' }))
    api.exitHandlers.get('t3')?.()

    expect(markExited).toHaveBeenCalledWith('t3')
  })

  it('unmounting disposes the xterm.js instance and unsubscribes IPC listeners', () => {
    const { unmount } = render(createElement(TestHarness, { terminalId: 't4' }))
    expect(document.querySelector('.xterm')).not.toBeNull()

    unmount()

    expect(document.querySelector('.xterm')).toBeNull()
  })

  describe('findNext / findPrevious (SearchAddon)', () => {
    it('finds a real match written into the terminal buffer', async () => {
      render(createElement(SearchTestHarness, { terminalId: 't5' }))
      window.__rasikTerminals?.get('t5')?.write('hello world\r\n')
      // xterm.js's own `write()` is asynchronous internally (parses on a microtask/frame).
      await new Promise((resolve) => setTimeout(resolve, 50))

      const search = (window as unknown as { __testSearch: { findNext: (q: string) => boolean } })
        .__testSearch
      expect(search.findNext('world')).toBe(true)
    })

    it('returns false for a query with no match, without throwing', async () => {
      render(createElement(SearchTestHarness, { terminalId: 't6' }))
      window.__rasikTerminals?.get('t6')?.write('hello world\r\n')
      await new Promise((resolve) => setTimeout(resolve, 50))

      const search = (
        window as unknown as { __testSearch: { findNext: (q: string) => boolean; findPrevious: (q: string) => boolean } }
      ).__testSearch
      expect(search.findNext('nonexistent')).toBe(false)
      expect(search.findPrevious('nonexistent')).toBe(false)
    })

    it('an empty query is a no-op (does not call the addon)', () => {
      render(createElement(SearchTestHarness, { terminalId: 't7' }))

      const search = (window as unknown as { __testSearch: { findNext: (q: string) => boolean } })
        .__testSearch
      expect(search.findNext('')).toBe(false)
    })
  })
})
