import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Explicit, rather than relying on RTL's global-`afterEach` auto-detection — this project
// doesn't enable Vitest's `globals` option, so that detection wouldn't fire.
afterEach(() => {
  cleanup()
})

// `monaco-editor`'s diff editor computes diffs on a background worker (real `Worker` isn't
// available under Vitest/jsdom, so Monaco falls back to a same-process worker facade); disposing
// a diff editor while that computation is still in flight makes Monaco's own cooperative-
// cancellation mechanism reject the in-flight promise with its own `CancellationError` (`name`
// and `message` both literally `'Canceled'`, `monaco-editor/esm/vs/base/common/errors.js`) — a
// real, intentional Monaco-internal signal, not a bug in this app's code or its tests. In a real
// browser this settles silently before anyone observes it; under Node's `unhandledRejection`
// reporting (what Vitest surfaces test-run failures through) it doesn't. Filtered by name
// rather than swallowed broadly — any other unhandled rejection still fails the run.
process.on('unhandledRejection', (reason: unknown) => {
  const isMonacoCancellation =
    typeof reason === 'object' &&
    reason !== null &&
    'name' in reason &&
    (reason as { name?: unknown }).name === 'Canceled'
  if (!isMonacoCancellation) throw reason
})

// jsdom has no ResizeObserver — BrowserPanel.tsx (Phase 13) is the first component that needs
// one. A minimal stub (never actually fires callbacks) is enough for tests that only assert on
// `observe`/`disconnect` being called, not on resize-triggered behavior.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom has no `window.matchMedia` — xterm.js's `CoreBrowserService` calls it unconditionally on
// construction (device-pixel-ratio tracking) whether or not a real display exists, so any test
// mounting a real `Terminal` (Phase 16's `useTerminal.test.ts`) needs this stubbed. Returns "no
// match, nothing subscribed" rather than a real media-query evaluation — nothing in this app's
// test suite depends on a query actually matching.
if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom has no `document.queryCommandSupported` (a legacy `execCommand`-family API) —
// `monaco-editor`'s clipboard contribution calls it unconditionally at module-load time to decide
// whether to register a paste command. Stubbed `false` (no legacy paste support), which is also
// the real-world answer in any modern browser this app actually ships in — nothing in this app's
// test suite exercises the legacy-paste code path this gates. Real, unmocked `monaco-editor` is
// otherwise fully loadable under Vitest once `vitest.config.ts`'s `resolve.mainFields` includes
// `'module'` (see that file's own comment).
if (typeof document.queryCommandSupported === 'undefined') {
  document.queryCommandSupported = () => false
}

// jsdom has no Clipboard API (`navigator.clipboard` is `undefined`) — `monaco-editor`'s clipboard
// service registers a document-level click handler that reads `navigator.clipboard.write`
// unconditionally, which crashes on any real DOM click once a Monaco editor has mounted (not
// specific to clicking the editor itself — any click anywhere in the document reaches it, since
// it's registered on `document.body`). A minimal no-op stub is enough; no test in this suite
// asserts on real clipboard content. `writable: true` (not just `configurable`) matters here —
// `FileTreeNode.test.tsx` already does its own `Object.assign(navigator, { clipboard: ... })`
// per-test override for its "copies the absolute path" test, which needs a plain property
// *set* to keep working, not just a redefine.
if (typeof navigator.clipboard === 'undefined') {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: {
      write: async () => {},
      writeText: async () => {},
      read: async () => [],
      readText: async () => '',
    },
  })
}

// jsdom also has no global `ClipboardItem` class — the same clipboard service constructs one to
// check `ClipboardItem.supports(...)` before it ever gets as far as calling `navigator.clipboard`
// above. A minimal stub, matching the real constructor's shape closely enough that nothing here
// constructs a real one anyway.
if (typeof globalThis.ClipboardItem === 'undefined') {
  class ClipboardItemStub {
    static supports(): boolean {
      return false
    }
  }
  globalThis.ClipboardItem = ClipboardItemStub as unknown as typeof ClipboardItem
}

// jsdom implements zero canvas rendering context (`HTMLCanvasElement.getContext` throws/warns
// "not implemented" without installing the native `canvas` npm package, the same category of gap
// `useTerminal.test.ts` already hit for WebGL — see that file's own jsdom-layout-gap notes).
// `monaco-editor` calls `document.createElement('canvas').getContext('2d')` unconditionally
// during editor construction (device-pixel-ratio detection, then real text-metric measurement) —
// deliberately not adding the native `canvas` package (a real native-compilation dependency this
// project has otherwise avoided; see the Playwright-in-this-sandbox shared-library workaround for
// the same category of native-dependency friction) in favor of a minimal fake 2D context, the
// same "stub just enough, not a full emulator" convention every other stub in this file follows.
// `measureText` returns a fixed-width-per-character approximation — good enough for Monaco to
// construct and lay out a real editor instance without crashing; not pixel-accurate, and no test
// in this suite should assert on exact glyph positions.
if (typeof HTMLCanvasElement !== 'undefined') {
  // A factory, not a shared singleton — Monaco's minimap code reads `canvasContext.canvas.width`
  // back off the context (real canvas contexts always carry a `.canvas` back-reference to the
  // element that created them), and different canvases (the main editor surface, the minimap)
  // need their own independently-sized backing buffers.
  function makeFake2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const sized = (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(w, 0) * Math.max(h, 0) * 4),
      width: w,
      height: h,
    })
    return {
      canvas,
      measureText: (text: string) => ({ width: text.length * 7 }),
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      rect: () => {},
      setTransform: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => sized(w, h),
      putImageData: () => {},
      // Monaco's minimap renders its own line-preview pixels directly into an ImageData buffer
      // (`MinimapBuffers`) — needs real width/height-sized backing storage, not an empty array.
      createImageData: (w: number, h: number) => sized(w, h),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D
  }
  const originalGetContext = HTMLCanvasElement.prototype.getContext.bind(HTMLCanvasElement.prototype)
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    ...args: unknown[]
  ): unknown {
    if (contextId === '2d') return makeFake2dContext(this)
    // WebGL/other context types: fall through to jsdom's real (not-implemented) behavior, same
    // as `useTerminal.ts`'s own `try/catch` around `WebglAddon` already expects and handles.
    return (originalGetContext as (id: string, ...rest: unknown[]) => unknown)(contextId, ...args)
  } as typeof HTMLCanvasElement.prototype.getContext
}
