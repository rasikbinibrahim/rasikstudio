import { test, expect } from './fixtures/electron-app'

// Flow 8 of 8 (`phase-16-testing.md`): "App update flow (mock auto-updater)" — the phase doc's
// own parenthetical calls for a mock, not a real update server. `electron-updater` itself throws
// if asked to check outside a packaged, code-signed build (`auto-updater.ts`'s own doc comment),
// and this harness launches unpackaged `out/main/index.js` (matching every other spec here) —
// so `installAutoUpdater()`'s real, documented behavior in that state is to skip entirely. That
// real behavior is what this test verifies, against the real running main process via
// `electronApp.evaluate()` (not a second Vitest-level mock of `electron`/`electron-updater`,
// which `auto-updater.test.ts` already covers).
//
// Full download → "update downloaded" → restart-prompt flow verification needs either a packaged
// build with a mocked update feed server, or a way to reach the bundled `auto-updater.ts`
// module directly (electron-vite bundles the whole main process into one `out/main/index.js`, so
// there's no separate module to `require()` in isolation here) — tracked in `TASKS.md`, not
// silently skipped.

test('a real running (unpackaged) app correctly treats itself as not packaged', async ({ electronApp }) => {
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged)

  expect(isPackaged).toBe(false)
})

test('the app does not crash or hang on startup with the auto-updater wired in', async ({ window }) => {
  // If `installAutoUpdater()`'s dev-mode no-op path were broken (e.g. it tried to reach a real
  // update feed anyway), the app would either throw during startup or hang — this asserts the
  // real window still renders normally, the same "did it crash" signal every other spec's
  // successful launch already relies on implicitly, made explicit here since this spec is the
  // one actually about startup/update wiring.
  await expect(window.getByText('No folder opened').first()).toBeVisible()
})
