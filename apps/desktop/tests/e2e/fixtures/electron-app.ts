import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import type { SidebarView } from '../../../src/store/ui-slice'

const MAIN_ENTRY = join(__dirname, '../../../out/main/index.js')

export interface AppFixtures {
  electronApp: ElectronApplication
  window: Page
}

/** Real Electron E2E fixture — launches the actual `out/main/index.js` build output (run `pnpm
 *  build` first) as a real OS process via Playwright's Electron support, the same one `pnpm
 *  start`/a packaged build would run. No mocking of Electron itself; only external services
 *  this app talks to (backend API, Ollama) are out of reach in a plain `pnpm test:e2e` run —
 *  each spec that needs one checks reachability and skips cleanly, per the same "environment
 *  gap, not a code gap" pattern used throughout this project's backend test suite. */
export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature requires this destructure even with no fixture dependencies
  electronApp: async ({}, use) => {
    const app = await electron.launch({ args: [MAIN_ENTRY] })
    await use(app)
    await app.close()
  },
  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  },
})

export { expect } from '@playwright/test'

/** Opens a real folder as the workspace, via the same `openFolderAtPath()` store action
 *  drag-and-drop uses (`workspace:openPath` IPC) — the native OS folder picker `openFolder()`
 *  would otherwise use isn't something a test can drive, so this is the real, non-dialog entry
 *  point into the identical code path, not a test-only backdoor. `window.__rasikTestStore` is
 *  `main.tsx`'s real `useAppStore` export, attached there specifically for this. */
export async function openWorkspace(page: Page, path: string): Promise<void> {
  await page.evaluate(async (workspacePath) => {
    await window.__rasikTestStore.getState().openFolderAtPath(workspacePath)
  }, path)
}

/** Same rationale as `openWorkspace()` — a real store-action entry point for state changes that
 *  have no dedicated keyboard shortcut (only some sidebar views do, per `App.tsx`'s
 *  `useKeyBinding` list). */
export async function setSidebarView(page: Page, view: SidebarView): Promise<void> {
  await page.evaluate((sidebarView) => {
    window.__rasikTestStore.getState().setSidebarView(sidebarView)
  }, view)
}

export async function getActiveTerminalId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__rasikTestStore.getState().activeTerminalId)
}

/** Reads a real terminal's actual screen-buffer text — xterm.js's WebGL renderer (real GPU/
 *  software-WebGL rendering, active in this app the same way it would be for a real user) draws
 *  to `<canvas>`, so there's no DOM text for Playwright's normal text assertions to see. Reads
 *  from `window.__rasikTerminals` (`useTerminal.ts`), the same `term.buffer.active` object
 *  xterm.js's own accessibility tree would read from — not a parallel, test-only data path. */
export async function readTerminalText(page: Page, terminalId: string): Promise<string> {
  return page.evaluate((id) => {
    const term = window.__rasikTerminals?.get(id)
    if (!term) return ''
    const lines: string[] = []
    for (let i = 0; i < term.buffer.active.length; i++) {
      lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? '')
    }
    return lines.join('\n')
  }, terminalId)
}
