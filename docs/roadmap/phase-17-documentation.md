# Phase 17 — Documentation

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** All prior phases
**Estimated effort:** 2 weeks

---

## Objective

Produce complete developer and user documentation: ADR backfill (update any ADRs that changed during development), API reference, user guide, plugin authoring guide, and a CONTRIBUTING guide. All documentation is accurate as of the shipped v1.0.0 codebase.

## Architecture

Documentation is co-located with code where appropriate (JSDoc for public APIs, Python docstrings for public use cases) and stored in `docs/` for everything else.

**FastAPI auto-documentation:** The OpenAPI schema at `/openapi.json` serves as the machine-readable API reference. Human-readable documentation in `docs/api/` links to the auto-generated schema — it does not re-derive it by hand, and it supersedes the design-time `API_SPECIFICATION.md` as the accurate reference once the API is implemented.

**OpenAPI → TypeScript types:** This phase confirms that `packages/desktop-types/` is actually generated from the OpenAPI schema (validates the ADR 0007 decision was implemented correctly).

## Dependencies

- Phase 16 complete (code is final and tested)
- Phase 1 ADRs (update any that changed during implementation)

## Files to Create

- `docs/user-guide/` — installation, workspace setup, AI features, keyboard shortcuts
- `docs/plugin-authoring/` — plugin manifest, API reference, examples
- `CONTRIBUTING.md` — branch strategy, PR process, coding standards, how to run tests
- `docs/api/` — human-readable API endpoint reference (links to the live OpenAPI schema)
- Update all 10 ADRs with an "Outcome" section (was the decision correct after implementation?)

## Files to Modify

- All root-level architecture documents — update to reflect actual implementation (remove decisions that were revised, add links to ADRs)
- `PROGRESS.md` — mark Phase 17 complete
- `PROJECT_MASTER_SPEC.md` — update status to v1.0.0 shipped

## Acceptance Criteria

- [ ] `CONTRIBUTING.md` exists with: clone, install, test, lint, and PR process instructions
- [ ] A developer who has never seen the project can run `make dev` in under 30 minutes using only `CONTRIBUTING.md`
- [ ] All 10 ADRs have an "Outcome" section
- [ ] Plugin authoring guide includes a complete "Hello World" plugin walkthrough
- [ ] OpenAPI schema is valid: `pnpm exec openapi-typescript http://localhost:8000/openapi.json` generates types without errors
- [ ] No broken links in any documentation file

## Estimated Effort

**2 weeks**
- Week 1: `CONTRIBUTING.md`, user guide, API docs, ADR updates
- Week 2: Plugin authoring guide, architecture doc updates, link checking
