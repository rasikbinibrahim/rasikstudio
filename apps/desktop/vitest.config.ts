import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Two projects, two runtimes: the renderer runs in jsdom (React components, browser APIs),
 *  Electron's main process runs in plain Node with no DOM and no React plugin. They can't share
 *  one `environment` setting, so `vitest run` fans out across both via `test.projects` — the
 *  successor to the separate `vitest.workspace.ts` file (`defineWorkspace`) Vitest 3 deprecated. */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          // `monaco-editor`'s package.json ships only a `"module"` field, no `"main"`/`"exports"`
          // — Vite's SSR-style module resolution (what Vitest's own transform pipeline uses,
          // even for jsdom-environment tests) defaults `mainFields` to `['main']` only, so a bare
          // `import('monaco-editor')` fails resolution entirely ("Failed to resolve entry for
          // package"), the reason `MonacoEditor.tsx`/`DiffViewer.tsx` had zero test coverage since
          // Phase 3. Explicitly including `'module'` here fixes it for the real, unmocked package.
          mainFields: ['browser', 'module', 'main'],
        },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['electron/main/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Real source only — without this, v8's default "everything Node touched" instrumentation
      // sweeps in `out/**` (the compiled production bundle, including Monaco's ~250K-line
      // `editor.main.js`), config files, and the tests themselves, collapsing the reported
      // percentage to a meaningless <1% (discovered when first wiring this up, Phase 16).
      include: ['src/**/*.{ts,tsx}', 'electron/main/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Pure type/interface files — no executable statements to cover, and v8's coverage
        // provider reports a file with zero statements as 0% rather than the arguably-more-
        // correct 100% (istanbul's provider handles this differently), so these would otherwise
        // permanently drag the average down for no real signal.
        'src/types/**',
        'src/store/types.ts',
        'src/features/command-palette/command-types.ts',
        // Electron main-process composition root, split across 3 files (`index.ts`'s own
        // app-lifecycle wiring, `window-manager.ts`'s `BrowserWindow` construction,
        // `ipc-registry.ts`'s `registerXHandlers()` calls) — every handler/manager they wire
        // together is already tested individually (git-handlers.test.ts, docker-handlers.test.ts,
        // etc.); testing the wiring itself would mean re-mocking the entire `electron` module
        // surface for near-zero additional signal over what those dedicated tests already cover.
        'electron/main/index.ts',
        'electron/main/window-manager.ts',
        'electron/main/ipc-registry.ts',
      ],
      thresholds: {
        // Matches `phase-16-testing.md`'s own acceptance criterion ("frontend coverage ≥ 80%
        // passes") — real measured coverage is ~82.6% as of Phase 16, so this has real margin,
        // not a number picked to just barely pass today. Line/statement coverage gated; branch/
        // function are reported but not gated, same asymmetry `TESTING_STRATEGY.md` accepts for
        // UI code where some branches are display-only (loading/error states) rather than logic.
        lines: 80,
        statements: 80,
      },
    },
  },
})
