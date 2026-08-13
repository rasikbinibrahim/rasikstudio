import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// `ANALYZE=1 pnpm build` (or `pnpm build:renderer --analyze` per PERFORMANCE_GUIDE.md's own
// acceptance criterion — same effect, this repo wires it via an env var rather than a literal
// CLI flag since Vite doesn't parse arbitrary custom flags itself) writes a real treemap of the
// renderer bundle to `dist-analyze/renderer-stats.html` — Phase 18's real, repeatable way to
// check the <500KB initial-bundle NFR target without hand-grepping build output every time.
const analyze = process.env['ANALYZE'] === '1'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({
              filename: 'dist-analyze/renderer-stats.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
  },
})
