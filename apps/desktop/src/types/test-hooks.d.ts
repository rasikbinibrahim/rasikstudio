import type { Terminal } from '@xterm/xterm'
import type { useAppStore } from '../store'

/** Shared ambient types for the renderer globals E2E tests read — set for real in `main.tsx`
 *  (`__rasikTestStore`) and `useTerminal.ts` (`__rasikTerminals`), consumed by
 *  `tests/e2e/fixtures/electron-app.ts`. A separate `.d.ts` (rather than inline `declare global`
 *  blocks at each call site) because the renderer (`tsconfig.json`) and E2E test
 *  (`tsconfig.e2e.json`) projects are two separate TypeScript programs that both need to see it. */
declare global {
  interface Window {
    __rasikTestStore: typeof useAppStore
    /** Real, live `Terminal` instances keyed by terminal id — xterm.js's WebGL renderer draws to
     *  `<canvas>`, not DOM text, so this is the only reliable way for a test to read what a
     *  terminal actually displays. */
    __rasikTerminals?: Map<string, Terminal>
  }
}

export {}
