# apps/desktop/tests/

End-to-end test suite for the Rasik Studio desktop application. **Unit tests are not here** — per `TESTING_STRATEGY.md` §5.1, Vitest unit tests are co-located next to the source they test: `src/**/*.test.ts(x)` for the renderer (e.g. `src/lib/fuzzy-match.ts` + `src/lib/fuzzy-match.test.ts` in the same folder), and `electron/main/**/*.test.ts` for the Electron main process (e.g. `electron/main/pty-manager.ts` + `electron/main/pty-manager.test.ts`). The two run as separate Vitest projects — jsdom for the renderer, Node for the main process — fanned out from one `vitest run` via `vitest.workspace.ts`. This folder previously also documented a `unit/` mirrored-tree convention that contradicted `TESTING_STRATEGY.md`; that was corrected in favor of co-location, which is both the documented standard and what's actually implemented.

## Structure

| Directory | Framework | Purpose |
|---|---|---|
| `e2e/` | Playwright + Electron | Full application flows: launch, edit, commit, chat |

## Coverage Targets

| Area | Target |
|---|---|
| Unit (overall) | ≥ 80% |
| Design system components | 100% (all variants, all states) |
| Zustand store slices | ≥ 90% |

Coverage is enforced in CI — a PR that drops below the threshold is blocked.
