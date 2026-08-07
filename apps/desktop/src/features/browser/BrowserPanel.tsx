import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { BrowserViewState } from '../../types/browser'

const DEFAULT_STATE: BrowserViewState = {
  url: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  title: '',
}

/** Bare `example.com` (no scheme) is treated as a URL to visit, same convention every desktop
 *  browser's address bar uses — anything that already looks like it has a scheme is left alone. */
function normalizeUrlInput(input: string): string {
  const trimmed = input.trim()
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** The interactive-browsing half of Phase 13 (`phase-13-browser.md`) — a real Electron
 *  `WebContentsView` (native, compositor-drawn), not something rendered inside this component's
 *  own DOM tree. This component only ever (1) reports its placeholder `<div>`'s bounding rect so
 *  the main process can position the native view on top of it, and (2) sends navigation commands
 *  / receives state updates over IPC. The agent's own browsing (Playwright, backend-side) is a
 *  completely separate context — see `AgentBrowserView.tsx`. */
export function BrowserPanel(): JSX.Element {
  const [state, setState] = useState<BrowserViewState>(DEFAULT_STATE)
  const [addressBarValue, setAddressBarValue] = useState('')
  const placeholderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.rasik.browser.getState().then((result) => {
      if (result.ok) setState(result.data)
    })
    return window.rasik.browser.onStateChange(setState)
  }, [])

  // The address bar shows the *navigated* URL, not whatever's mid-edit — but only when the user
  // isn't actively typing into it (tracked via a ref so this effect doesn't need `addressBarValue`
  // itself as a dependency, which would fight every keystroke).
  const isEditingRef = useRef(false)
  useEffect(() => {
    if (!isEditingRef.current) setAddressBarValue(state.url)
  }, [state.url])

  // Reports this panel's on-screen position/size to the main process so it can position the
  // native WebContentsView exactly on top of this placeholder — re-measured on every resize
  // (window resize, sidebar/terminal panel resize) via ResizeObserver, and hidden (collapsed to
  // zero size) on unmount, since switching to a different sidebar view unmounts this component
  // but the native view isn't part of the React tree and would otherwise keep floating in place.
  useEffect(() => {
    const element = placeholderRef.current
    if (!element) return

    const syncBounds = (): void => {
      const rect = element.getBoundingClientRect()
      window.rasik.browser.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    syncBounds()
    const observer = new ResizeObserver(syncBounds)
    observer.observe(element)
    window.addEventListener('resize', syncBounds)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.rasik.browser.hide()
    }
  }, [])

  function navigateTo(input: string): void {
    const url = normalizeUrlInput(input)
    setAddressBarValue(url)
    void window.rasik.browser.navigate(url)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border-subtle p-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!state.canGoBack}
          onClick={() => void window.rasik.browser.back()}
          aria-label="Back"
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!state.canGoForward}
          onClick={() => void window.rasik.browser.forward()}
          aria-label="Forward"
        >
          <ArrowRight size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void window.rasik.browser.reload()} aria-label="Reload">
          <RotateCw size={14} className={state.loading ? 'animate-spin' : ''} />
        </Button>
        <input
          value={addressBarValue}
          onFocus={() => {
            isEditingRef.current = true
          }}
          onBlur={() => {
            isEditingRef.current = false
          }}
          onChange={(event) => setAddressBarValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigateTo(addressBarValue)
          }}
          placeholder="Enter a URL"
          className="flex-1 rounded border border-border-default bg-bg-input px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
        />
      </div>
      {/* The native WebContentsView is positioned exactly over this element by the main process —
          it renders nothing itself. */}
      <div ref={placeholderRef} className="min-h-0 flex-1" />
    </div>
  )
}
