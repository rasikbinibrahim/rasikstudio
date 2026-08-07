# Phase 16 — Testing

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** All prior phases
**Estimated effort:** 3 weeks

---

## Objective

Achieve the coverage targets defined in `TESTING_STRATEGY.md` across all subsystems, complete the E2E test suite for all 8 critical flows, and integrate coverage enforcement into CI so coverage never regresses. This phase also fills any gaps in the unit and integration test suites from prior phases.

## Architecture

**Coverage targets (from `TESTING_STRATEGY.md`):**
- Backend: 85% line coverage
- Frontend: 80% line coverage
- Agent tools: 90% line coverage (highest risk code)

**Test pyramid:**
- ~500 unit tests (fast, isolated)
- ~150 integration tests (real DB, real Redis — testcontainers)
- ~20 E2E tests (Playwright Electron)

**8 critical E2E flows:**
1. App launch → workspace open → file edit → save
2. Chat with local AI model (stream visible in UI)
3. Agent task execution with approval gate
4. Git stage → commit → verify with `git log`
5. Terminal: open, run command, see output
6. File search (Ctrl+P) + code navigation (go-to-definition)
7. Theme switch (dark ↔ light) + settings change
8. App update flow (mock auto-updater)

**File naming convention:**
```
Source file:  app/infrastructure/ai/ollama_provider.py
Test file:    tests/unit/infrastructure/ai/test_ollama_provider.py
```
Frontend tests are co-located instead: `src/features/chat/ChatPanel.tsx` → `src/features/chat/ChatPanel.test.tsx` in the same folder (see `TESTING_STRATEGY.md` §5.1).

## Dependencies

- All prior phases complete
- `@playwright/test` with Electron integration
- `testcontainers-python`
- `pytest-cov`
- `@vitest/coverage-v8`

## Files to Create

- `tests/e2e/` — all 8 E2E test files
- `tests/e2e/fixtures/` — workspace fixtures, mock server fixtures
- Backend: fill all missing unit and integration tests across all phases
- Frontend: fill all missing component and hook tests
- `.github/workflows/test.yml` — add coverage enforcement (fail if below threshold)

## Files to Modify

- `pytest.ini` — add `--cov` with threshold enforcement
- `vitest.config.ts` — add coverage threshold enforcement
- `PROGRESS.md` — mark all covered phases with test coverage percentages

## Acceptance Criteria

- [ ] `pytest --cov=app --cov-fail-under=85` passes
- [ ] `pnpm vitest --coverage` with frontend coverage ≥ 80% passes
- [ ] Agent tool coverage ≥ 90% (subset of backend coverage)
- [ ] All 8 E2E tests pass on CI (Ubuntu, Windows, macOS matrix)
- [ ] CI fails a PR that reduces coverage below threshold
- [ ] All test files follow the naming convention (directory mirroring source)
- [ ] Integration tests use real PostgreSQL and Redis (verify via testcontainers logs — no fakeredis/SQLite in integration)

## Testing Strategy

This phase is itself the testing phase. Quality gate: all acceptance criteria above.

## Estimated Effort

**3 weeks**
- Week 1: Fill backend unit + integration test gaps, configure coverage in CI
- Week 2: Fill frontend unit test gaps, configure frontend coverage
- Week 3: All 8 E2E tests, E2E CI matrix, final coverage pass
