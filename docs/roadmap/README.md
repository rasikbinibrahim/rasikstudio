# Implementation Roadmap — Rasik Studio

**Version:** 1.1.0
**Last Updated:** 2026-08-03
**Status:** Pre-development

---

## How to Use This Document

This roadmap is the execution contract for the entire project. Each phase must be completed and signed off before the next begins. "Completed" means every acceptance criterion is met and every test passes — not that code exists.

Before starting any phase:
1. Read the phase specification in full (linked below — one file per phase).
2. Confirm all dependencies from prior phases are met.
3. Design before coding (see `CLAUDE.md` §Development Rules).

This index holds everything that applies across phases — the summary table, critical path, security gate, and sign-off template. Phase-specific detail (objective, architecture, files, acceptance criteria, effort) lives in its own file so no single document has to hold all 18 phases at once.

---

## Phase Summary Table

| # | Phase | File | Effort | Depends On | Status |
|---|---|---|---|---|---|
| 1 | Project Architecture | [phase-01-project-architecture.md](phase-01-project-architecture.md) | 1 week | — | NOT STARTED |
| 2 | Folder Structure & Tooling | [phase-02-folder-structure-tooling.md](phase-02-folder-structure-tooling.md) | 3 days | 1 | NOT STARTED |
| 3 | Desktop Application Shell | [phase-03-desktop-application-shell.md](phase-03-desktop-application-shell.md) | 4 weeks | 2 | NOT STARTED |
| 4 | Backend Foundation | [phase-04-backend-foundation.md](phase-04-backend-foundation.md) | 3 weeks | 2 | NOT STARTED |
| 5 | Database Layer | [phase-05-database-layer.md](phase-05-database-layer.md) | 1 week | 4 | NOT STARTED |
| 6 | Authentication | [phase-06-authentication.md](phase-06-authentication.md) | 2 weeks | 5 | NOT STARTED |
| 7 | WebSocket Gateway | [phase-07-websocket-gateway.md](phase-07-websocket-gateway.md) | 1 week | 6 | NOT STARTED |
| 8 | Agent Framework | [phase-08-agent-framework.md](phase-08-agent-framework.md) | 4 weeks | 7, 9 | NOT STARTED |
| 9 | Model Router | [phase-09-model-router.md](phase-09-model-router.md) | 2 weeks | 4 | NOT STARTED |
| 10 | AI Chat | [phase-10-ai-chat.md](phase-10-ai-chat.md) | 3 weeks | 3, 7, 9 | NOT STARTED |
| 11 | Terminal | [phase-11-terminal.md](phase-11-terminal.md) | 2 weeks | 3 | NOT STARTED |
| 12 | Git Integration | [phase-12-git-integration.md](phase-12-git-integration.md) | 2 weeks | 3, 4 | NOT STARTED |
| 13 | Browser | [phase-13-browser.md](phase-13-browser.md) | 2 weeks | 3, 4 | NOT STARTED |
| 14 | Docker Integration | [phase-14-docker-integration.md](phase-14-docker-integration.md) | 1 week | 4 | NOT STARTED |
| 15 | Deployment Pipeline | [phase-15-deployment-pipeline.md](phase-15-deployment-pipeline.md) | 2 weeks | 3, 4 | NOT STARTED |
| 16 | Testing | [phase-16-testing.md](phase-16-testing.md) | 3 weeks | All prior | NOT STARTED |
| 17 | Documentation | [phase-17-documentation.md](phase-17-documentation.md) | 2 weeks | All prior | NOT STARTED |
| 18 | Optimization | [phase-18-optimization.md](phase-18-optimization.md) | 3 weeks | 16 | NOT STARTED |

**Total estimated effort:** 40–42 weeks (solo engineer)

---

## Critical Path

Phases that block the most downstream work:

```
Phase 1 → Phase 2 → Phase 3 ─────────────────────────────→ Phase 10, 11, 12, 13, 14
                  → Phase 4 → Phase 5 → Phase 6 → Phase 7 ↗
                                       → Phase 9 ─────────→ Phase 8, 10
```

**Never parallelize:** Phases 1 and 2 must complete before anything else. Phases 4 and 3 can run in parallel after Phase 2.

**Natural parallelization opportunities (if multiple engineers):**
- Phase 3 (desktop shell) + Phase 4 (backend foundation): parallel after Phase 2
- Phase 9 (model router) + Phase 11 (terminal): parallel after Phase 3/4
- Phase 12 (git) + Phase 13 (browser) + Phase 14 (docker): parallel after Phase 3/4

---

## Security Gate (applied to every phase)

Before any phase is marked complete, the following checklist must pass (this mirrors `SECURITY_GUIDELINES.md §12` — kept here as a per-phase reminder, not a separate source of truth):

- [ ] No hardcoded secrets or credentials
- [ ] All file system paths validated against workspace root
- [ ] No `shell=True` in Python subprocess calls
- [ ] No string-interpolated shell commands in TypeScript
- [ ] `contextIsolation: true` and `nodeIntegration: false` unchanged in Electron config
- [ ] All new API endpoints require authentication (unless explicitly public)
- [ ] New agent tools have appropriate risk levels and approval gates
- [ ] `pnpm audit` and `pip-audit` pass with no critical/high vulnerabilities

---

## Phase Completion Sign-Off Template

When marking a phase complete in `PROGRESS.md`, record:

```markdown
## Phase N — [Name]

**Status:** COMPLETE
**Completed:** YYYY-MM-DD
**Duration:** N days (estimated: N days)

### Acceptance Criteria
- [x] Criterion 1
- [x] Criterion 2
...

### Test Results
- Unit tests: N passing, 0 failing
- Integration tests: N passing, 0 failing
- Coverage: N%

### Deviations from Plan
- [Any changes from this roadmap, with rationale]

### Issues Discovered
- [Any bugs or risks discovered during this phase]

### Next Phase Dependencies Confirmed
- [ ] Phase N+1 dependencies verified
```

---

## Related Documents

| Topic | Document |
|---|---|
| Operating rules for this repo | `CLAUDE.md` |
| Product vision, stack, features | `PROJECT_MASTER_SPEC.md` |
| Directory tree | `FOLDER_STRUCTURE.md` |
| Module/service/interface reference | `PROJECT_STRUCTURE.md` |
| Current phase status | `PROGRESS.md` |
