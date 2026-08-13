import { defineConfig } from '@playwright/test'

/** Real Electron E2E, per `TESTING_STRATEGY.md` §6.1 / `phase-16-testing.md`'s 8 critical flows.
 *  Launches the actual `out/main/index.js` build output (`pnpm build` must have run first) — no
 *  packaging step needed, same as how `_electron.launch()` is meant to be used in development.
 *  `workers: 1`: each test launches its own real Electron process against its own temp
 *  workspace (see `fixtures/workspace.ts`) — not sharing app state, but also not free to run
 *  many real Electron instances concurrently on a CI runner. */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
})
