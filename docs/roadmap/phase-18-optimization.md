# Phase 18 — Optimization

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 16, Phase 17
**Estimated effort:** 3 weeks

---

## Objective

Profile the application against all non-functional requirements from `PROJECT_MASTER_SPEC.md`, identify any targets not met, and fix them. This is not a "nice to have" — if startup takes 4 seconds instead of 2, it must be fixed here before v1.0.0 ships.

## Architecture

**Profiling tools:**
- Desktop renderer: Chrome DevTools Performance tab
- Desktop main process: Node.js `--inspect=9229`
- Backend: `py-spy`, `pyinstrument` middleware
- Database: `EXPLAIN ANALYZE` for all common query patterns

**NFR targets (must all pass — see `PERFORMANCE_GUIDE.md §1` for the canonical table):**

| Metric | Target |
|---|---|
| Cold startup | < 2s |
| Warm startup | < 1s |
| File open | < 100ms |
| Editor keystrokes | < 16ms |
| AI TTFT (local) | < 500ms |
| AI TTFT (cloud) | < 1500ms |
| Terminal input lag | < 10ms |
| File tree (1K nodes) | < 50ms |
| Semantic search | < 300ms |
| API p99 (non-AI) | < 200ms |

**Known optimizations to apply (from `PERFORMANCE_GUIDE.md`):**
- Embedding: batched embedding API calls, not single-chunk (`PERFORMANCE_GUIDE.md §4.4`, `RAG_SYSTEM.md §3.4`)
- RAG indexing: `(mtime, size)` comparison before SHA-256 (`RAG_SYSTEM.md §7`)
- Completion cache: `cachetools.TTLCache`, not a bare module-level dict (`PERFORMANCE_GUIDE.md §4.3`)
- Monaco: confirm web workers are active
- Initial bundle: verify < 500KB without Monaco (`PERFORMANCE_GUIDE.md §7`)

## Dependencies

- Phase 16 complete (all tests passing — optimization must not break tests)
- Phase 17 complete (documentation in sync)

## Files to Modify

- Any files where profiling reveals they are not meeting NFR targets
- `apps/desktop/vite.config.ts` — bundle splitting if initial bundle exceeds 500KB
- `app/infrastructure/ai/embedding_service.py` — confirm batch embedding calls
- `app/agents/tools/file_tools.py` — confirm `aiofiles` usage
- `app/application/rag/index_file.py` — `(mtime, size)` pre-check
- `PERFORMANCE_GUIDE.md` — update with measured baseline numbers

## Acceptance Criteria

- [ ] All 10 NFR targets verified with measurements (documented in `PERFORMANCE_GUIDE.md` under a new "Baselines" section)
- [ ] Cold startup < 2s measured on a clean profile (no V8 cache)
- [ ] AI TTFT < 500ms with Ollama `qwen2.5-coder:1.5b` on the test machine
- [ ] Initial renderer bundle < 500KB (measured via `pnpm build:renderer --analyze`)
- [ ] Embedding batch calls verified (no single-chunk calls in production code path)
- [ ] `cachetools.TTLCache` used for completion cache (confirmed by code inspection)
- [ ] `pnpm -r run test` still passes after all optimizations
- [ ] Memory usage: renderer < 400MB with 10 files open (measured in Chrome DevTools)

## Testing Strategy

Regression: all Phase 16 tests must continue to pass. NFR measurements are recorded in `PERFORMANCE_GUIDE.md` for the record.

## Estimated Effort

**3 weeks**
- Week 1: Profile cold startup, file open, keystroke latency; fix identified bottlenecks
- Week 2: Profile backend (API p99, embedding batch, RAG indexing); fix identified bottlenecks
- Week 3: Profile AI (TTFT, completion cache); final NFR measurement pass; document baselines
