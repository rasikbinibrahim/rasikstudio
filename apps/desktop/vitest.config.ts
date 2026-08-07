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
        // Electron main-process composition root — wires together every IPC handler/manager
        // already tested individually (git-handlers.test.ts, docker-handlers.test.ts, etc.);
        // testing it would mean re-mocking the entire `electron` module surface for near-zero
        // additional signal over what those dedicated tests already cover.
        'electron/main/index.ts',
      ],
    },
  },
})
