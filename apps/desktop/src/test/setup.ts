import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Explicit, rather than relying on RTL's global-`afterEach` auto-detection — this project
// doesn't enable Vitest's `globals` option, so that detection wouldn't fire.
afterEach(() => {
  cleanup()
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
