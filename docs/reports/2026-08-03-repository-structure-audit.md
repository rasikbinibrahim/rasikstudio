# Repository Organization Report & Migration Plan

**Date:** 2026-08-03
**Scope:** Every markdown document in the repository (27 root docs + 6 `docs/` subfolders + ~150 per-folder `README.md` files) read in full, cross-referenced against a fresh inspection of the live file tree. No application code was read, changed, or generated for this report — this is a documentation and structure analysis only, per the request that produced it.

---

## 1. Executive Summary

The repository's **folder structure is in excellent shape**: every directory documented in `FOLDER_STRUCTURE.md`'s authoritative tree already exists on disk, each with its own `README.md`, and the convention has been applied with unusual consistency (I did not find a single planned folder missing its placeholder README). Phases 1–3 have started filling in real source files inside that pre-built skeleton without deviating from it.

The one real structural issue is at the **repository root**: 27 markdown files sit loose next to the operational tooling config (`package.json`, `turbo.json`, etc.), which is unusual for an "enterprise" monorepo and makes the root harder to scan at a glance. This was not an oversight — `docs/README.md` records it as a deliberate choice ("root-level docs are the source of truth, `docs/` is supplementary") — but it's worth revisiting now that the project has real code and the root's job is increasingly "how do I build and run this," not "what is the RAG chunking strategy."

Everything else in this report is comparatively minor: one confusing document-naming collision, a handful of standard OSS files that don't exist yet (most already tracked as future work), and small consistency nits. There are **no missing folders relative to the documented target** — only missing *files inside* already-correct folders, which is expected pre-implementation state, not a structural defect.

---

## 2. Current Top-Level Inventory & Responsibilities

| Entry | Kind | Responsibility (as currently used) |
|---|---|---|
| `.github/` | config | GitHub Actions workflows (`workflows/`) and platform config (CODEOWNERS, PR/issue templates, dependabot — all still "when added" per its own README) |
| `.claude/` | tooling | Claude Code session-local settings; not part of the product |
| `apps/` | code | The two deployable units — `desktop/` (Electron+React IDE) and `backend/` (FastAPI service). Never import each other's source; talk only over HTTP/WebSocket |
| `packages/` | code | Shared library code consumed by `apps/`. Today: only `desktop-types/`, generated from the backend's OpenAPI schema (ADR 0007). Deliberately kept minimal — `packages/README.md` requires justifying any addition |
| `docs/` | docs | *Supplementary*, audience-specific documentation: ADRs, human-readable API reference, plugin authoring guide, reference-project analyses, the phased roadmap, end-user guide. Explicitly documented as **not** the source of truth for design decisions (see Finding 3.3) |
| 27 root `*.md` files | docs | Currently the *authoritative* architecture/spec/process docs — see the full breakdown in §5 |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `docker-compose.yml`, `.prettierrc.json`, `.prettierignore`, `.gitignore` | config | Monorepo tooling — pnpm workspace + Turborepo orchestration, shared TS/lint/format config, local dev compose |

---

## 3. Findings

### 3.1 Missing folders

**None, relative to the documented target.** Every directory in `FOLDER_STRUCTURE.md`'s tree exists on disk today, including ones with zero source files yet (e.g. `apps/backend/app/domain/models/`, `apps/desktop/src/services/`) — those are correctly empty because the phases that populate them (5, 9, 10, …) haven't run yet, not because a folder is missing.

Two folders are worth creating as *additions* to the documented target, both proposed as part of this report:

| Proposed folder | Purpose | Status |
|---|---|---|
| `docs/reports/` | Point-in-time audit/analysis documents (this report is the first one) | **Created as part of this report** — see `docs/reports/README.md` |
| `docs/architecture/` | New home for the 21 root spec docs that should move out of the repo root (Finding 3.3 / §5) | Proposed, not yet created — part of the migration plan (§6) |

One documented-but-not-yet-created folder, already tracked and not a new finding: `.github/ISSUE_TEMPLATE/`, listed in `.github/README.md` as "when added." Every *other* planned-but-empty folder in the repo got a README placeholder when the skeleton was built; this is the one exception. Low priority, but worth closing for consistency the next time `.github/` is touched.

### 3.2 Folders/documents that should be renamed

**No folder in the actual directory tree needs renaming.** Naming is consistent throughout: kebab-case for multi-word TS/JS folders (`file-explorer`, `command-palette`, `desktop-types`), snake_case for Python modules, and domain terms (`domain/ports/`, `app/agents/` living outside the Clean Architecture layers) are used correctly and match the architecture docs that define them. I looked specifically for a case to rename `app/agents/` to something that better signals "deliberately outside the four Clean Architecture layers" (e.g. `app/orchestration/`) but concluded it isn't worth the churn — the name is already clear and is referenced by name in a dozen+ places across the docs.

**One document rename is worth making:** `PROJECT_STRUCTURE.md` and `FOLDER_STRUCTURE.md` are easy to confuse from the title alone. `FOLDER_STRUCTURE.md` is exactly what it says — the directory tree. `PROJECT_STRUCTURE.md` is something different and more valuable: a module/service/interface reference ("what lives where, and what does it do, at every level of granularity" — its own words). Recommend renaming it to **`ARCHITECTURE_REFERENCE.md`** so the two names stop implying they're the same document. All internal cross-references to `PROJECT_STRUCTURE.md` (`README.md`, `IMPLEMENTATION_ROADMAP.md`/`docs/roadmap/README.md`, and several of the 21 docs moving in §5) need updating alongside this rename — folded into the migration plan (§6).

### 3.3 Root documentation clutter — the main finding

27 markdown files at the repository root is unusual for an enterprise monorepo; typical convention keeps root to README/LICENSE/CONTRIBUTING/config and pushes deep reference material into `docs/`. `docs/README.md` currently documents the opposite as intentional:

> "Architecture documents (the `.md` files in the project root) are the source of truth for design decisions. This `docs/` folder holds supplementary, audience-specific documentation."

That's a real, considered tradeoff, not a mistake — keeping specs at root maximizes their visibility (nobody has to guess which subfolder to open). But the project already has a working precedent for the alternative: **`IMPLEMENTATION_ROADMAP.md` was already cut down to a 12-line pointer, with all the real content moved to `docs/roadmap/`**, specifically because it had grown too large to navigate at the root. That's the same move I'm recommending for the other 21 docs, at a smaller scale each but larger in aggregate.

**Recommendation:** introduce `docs/architecture/` as the new home for the 21 deep-reference docs (§5 has the full list), and keep only the four documents a contributor needs in their first five minutes — `README.md`, `CLAUDE.md`, `PROGRESS.md`, `FOLDER_STRUCTURE.md` — plus new standard files (§3.4) at the root. This preserves the "authoritative vs. supplementary" distinction `docs/README.md` already establishes; it just relocates the authoritative tier rather than eliminating it, and the rule in `docs/README.md` gets one sentence updated to say so.

**This reverses a recorded decision, so I'm flagging it as a recommendation requiring your sign-off, not something I've executed.** If you'd rather keep the current flat-root layout, the rest of this report (missing files, the one rename, the placement table in §5 restated as "stays at root") still stands on its own.

### 3.4 Missing top-level files

| File | Status | Notes |
|---|---|---|
| `LICENSE` | **Missing, untracked anywhere** | No document declares a license for Rasik Studio itself (reference projects' licenses are tracked for compliance, but the project's own license is undeclared). This is the one gap in this report I'd call a real oversight rather than "not built yet" — worth a decision before the repository is shared beyond this environment. Not a decision I can make for you. |
| `CONTRIBUTING.md` | Missing, but tracked | Explicit Phase 17 deliverable (`docs/roadmap/phase-17-documentation.md`) |
| `CHANGELOG.md` | Missing, but tracked | Same, Phase 17 |
| `.github/CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/`, `dependabot.yml` | Missing, but tracked | Listed as "when added" in `.github/README.md` |
| `.editorconfig` | Missing, untracked | Not mentioned by any doc. Low-cost, common enterprise hygiene (consistent indentation/line-endings across editors for contributors not using the recommended IDE settings). Optional. |
| `.vscode/settings.json`, `.vscode/extensions.json` | Missing, untracked | Shared editor settings + recommended extensions (ESLint, Prettier, Python, Tailwind). Optional, but has a nice dogfooding angle for a project that *is* an IDE. |
| `SECURITY.md` (GitHub's auto-detected filename) | N/A — see §5 | The content exists as `SECURITY_GUIDELINES.md`, but under a name GitHub's UI doesn't recognize. See placement table. |

None of these block anything; they're additive.

---

## 4. Recommended Target Structure

```
rasik-studio/
├── .github/
│   ├── workflows/                        # unchanged
│   ├── ISSUE_TEMPLATE/                    # NEW — closes the one placeholder-README gap
│   ├── CODEOWNERS                         # NEW — already tracked in .github/README.md
│   ├── PULL_REQUEST_TEMPLATE.md           # NEW — already tracked
│   └── dependabot.yml                     # NEW — already tracked
├── .vscode/                               # NEW, optional — contributor DX
│   ├── settings.json
│   └── extensions.json
├── apps/                                  # unchanged — see §2
│   ├── desktop/
│   └── backend/
├── packages/                              # unchanged — see §2
│   └── desktop-types/
├── docs/
│   ├── architecture/                      # NEW — the 21 relocated root docs (§5)
│   ├── adr/                               # unchanged
│   ├── api/                               # unchanged
│   ├── plugin-authoring/                  # unchanged
│   ├── reference/                         # unchanged
│   ├── reports/                           # NEW — created as part of this report
│   ├── roadmap/                           # unchanged
│   └── user-guide/                        # unchanged
├── .editorconfig                          # NEW, optional
├── .gitignore                             # unchanged
├── .prettierignore                        # unchanged
├── .prettierrc.json                       # unchanged
├── CLAUDE.md                              # stays — operating rules, read first
├── README.md                              # stays — entry point
├── PROGRESS.md                            # stays — active status, read first
├── FOLDER_STRUCTURE.md                    # stays — directory tree, read before adding files
├── LICENSE                                # NEW — currently undecided (§3.4)
├── SECURITY.md                            # renamed+kept at root, from SECURITY_GUIDELINES.md
├── CONTRIBUTING.md                        # NEW, tracked (Phase 17)
├── CHANGELOG.md                           # NEW, tracked (Phase 17)
├── docker-compose.yml                     # unchanged
├── eslint.config.js                       # unchanged
├── package.json                           # unchanged
├── pnpm-workspace.yaml                    # unchanged
├── tsconfig.base.json                     # unchanged
└── turbo.json                             # unchanged
```

`IMPLEMENTATION_ROADMAP.md` is not in this tree — see §6 Step 4 (recommend removing it, it's a pointer whose target can be linked directly).

**Why not go further and subdivide `docs/architecture/` into e.g. `architecture/backend/`, `architecture/frontend/`, `architecture/ai/`?** Considered and rejected: 21 files in one flat folder is still easy to scan (roughly the same count as `docs/reference/`'s 9 subfolders or `docs/roadmap/`'s 18 phase files, both of which work fine flat), and splitting by subsystem would require deciding which bucket cross-cutting docs like `SECURITY_GUIDELINES.md` or `PERFORMANCE_GUIDE.md` belong in — adding a real classification cost for no clear navigation benefit at this size. Revisit only if the count grows substantially past this.

---

## 5. Documentation Placement Map

Every root document, its recommended destination, and why.

| Document | Recommended location | Rationale |
|---|---|---|
| `README.md` | **Stays at root** | Entry point |
| `CLAUDE.md` | **Stays at root** | Operating rules for this repo, needed before any work starts |
| `PROGRESS.md` | **Stays at root** | Active/mutable status, explicitly "read before doing any work" |
| `FOLDER_STRUCTURE.md` | **Stays at root** | Read-before-adding-files reference, same tier as the three above |
| `IMPLEMENTATION_ROADMAP.md` | **Remove** | Already a pure redirect to `docs/roadmap/README.md`; once `README.md`'s index links there directly, this stub has no remaining purpose |
| `SECURITY_GUIDELINES.md` | **Root, renamed `SECURITY.md`** | GitHub auto-detects this exact filename and surfaces it in the repo's Security tab/advisories UI — a real platform integration, worth the rename |
| `PROJECT_MASTER_SPEC.md` | `docs/architecture/` | Deep reference (vision, stack, phases) — not needed to make your first commit |
| `PROJECT_STRUCTURE.md` | `docs/architecture/ARCHITECTURE_REFERENCE.md` | Moved + renamed (Finding 3.2) |
| `AGENT_FRAMEWORK.md` | `docs/architecture/` | Subsystem deep-reference |
| `AI_ARCHITECTURE.md` | `docs/architecture/` | Subsystem deep-reference |
| `API_SPECIFICATION.md` | `docs/architecture/` | Subsystem deep-reference |
| `AUTHENTICATION.md` | `docs/architecture/` | Subsystem deep-reference |
| `BACKEND_ARCHITECTURE.md` | `docs/architecture/` | Subsystem deep-reference |
| `BROWSER_AUTOMATION.md` | `docs/architecture/` | Subsystem deep-reference |
| `DATABASE_DESIGN.md` | `docs/architecture/` | Subsystem deep-reference |
| `DEPLOYMENT_GUIDE.md` | `docs/architecture/` | Deep reference; consulted when deploying, not on first clone |
| `FRONTEND_ARCHITECTURE.md` | `docs/architecture/` | Subsystem deep-reference |
| `GIT_INTEGRATION.md` | `docs/architecture/` | Subsystem deep-reference |
| `MEMORY_SYSTEM.md` | `docs/architecture/` | Subsystem deep-reference |
| `MODEL_ROUTER.md` | `docs/architecture/` | Subsystem deep-reference |
| `PERFORMANCE_GUIDE.md` | `docs/architecture/` | Deep reference |
| `PLUGIN_SYSTEM.md` | `docs/architecture/` | Subsystem deep-reference |
| `RAG_SYSTEM.md` | `docs/architecture/` | Subsystem deep-reference |
| `TERMINAL_DESIGN.md` | `docs/architecture/` | Subsystem deep-reference |
| `TESTING_STRATEGY.md` | `docs/architecture/` | Deep reference |
| `UI_DESIGN_SYSTEM.md` | `docs/architecture/` | Subsystem deep-reference |
| `WORKSPACE_MANAGEMENT.md` | `docs/architecture/` | Subsystem deep-reference |

The existing `docs/` subfolders (`adr/`, `api/`, `plugin-authoring/`, `reference/`, `roadmap/`, `user-guide/`) are unaffected — they already hold exactly the audience-specific supplementary material `docs/README.md` describes, correctly separated from the (currently root-level) authoritative specs.

---

## 6. Migration Plan

Ordered so each step leaves the repo in a working, internally-consistent state — nothing here has been executed.

**Step 0 — Decide the open questions first** (blocking, not mine to decide):
- License choice (§3.4) — affects the `LICENSE` file content and the license header convention, if any.
- Whether to proceed with the root → `docs/architecture/` move at all (§3.3) — everything below assumes yes.

**Step 1 — Additive, zero-risk (already done as part of this report):**
- `docs/reports/` created with this document inside it.

**Step 2 — Create the new home:**
- `mkdir docs/architecture`, add `docs/architecture/README.md` following the repo's existing per-folder README convention (audience, contents, one-line placement rule pointing back to `docs/README.md`).

**Step 3 — Move + rename, one `git mv` per file** (preserves history, unlike delete+recreate):
- `git mv PROJECT_STRUCTURE.md docs/architecture/ARCHITECTURE_REFERENCE.md`
- `git mv SECURITY_GUIDELINES.md SECURITY.md` (root → root, rename only)
- `git mv <each of the remaining 20 docs> docs/architecture/`

**Step 4 — Fix cross-references (the real work, not the file moves):**
- Every doc in this repo refers to others by bare filename ("See `MODEL_ROUTER.md` §7", "per `SECURITY_GUIDELINES.md` §12", etc.). Because the 21 moved docs move **together** as a group, references *among themselves* keep working unchanged. What breaks and needs a path prefix or update:
  - References **from** the four root-quartet docs (`README.md`, `CLAUDE.md`, `PROGRESS.md`, `FOLDER_STRUCTURE.md`) **into** the moved set — update to `docs/architecture/<file>`.
  - References **from** the moved docs **back to** the root quartet or to `SECURITY.md` — update to `../../<file>` (or the correct relative depth).
  - References **from** `docs/roadmap/*.md` and other `docs/` subfolders into the moved docs — these already use relative paths out of `docs/`, so most become simpler (`../architecture/<file>` instead of `../../<file>`).
  - Every reference to the old name `PROJECT_STRUCTURE.md` (including in `docs/roadmap/README.md`'s "Related Documents" table) becomes `docs/architecture/ARCHITECTURE_REFERENCE.md`.
  - `docs/README.md`'s rule sentence ("Architecture documents ... in the project root ... are the source of truth") gets one clause updated to say `docs/architecture/` instead of "the project root."
  - `README.md`'s "Start here" index (built earlier this session) needs its category tables re-pointed at the new paths.
  - Practical approach: `grep -rl '\.md' --include='*.md'` for each of the 21 filenames across the repo, fix each hit. This is mechanical but not small — expect on the order of 60–100 individual reference updates across ~30 files, based on how densely these docs already cross-link each other.

**Step 5 — Remove the now-pointless redirect:**
- Delete `IMPLEMENTATION_ROADMAP.md` once `README.md` links `docs/roadmap/README.md` directly. Low risk — it's already a 12-line stub, not load-bearing.

**Step 6 — Verify:**
- `grep -rn '](\.\./' docs/ ; grep -rEn '\]\([A-Z_]+\.md\)' *.md docs/` (or equivalent) to catch any remaining broken relative links.
- Confirm every file in `docs/architecture/` is reachable from `docs/README.md`'s table and from `README.md`'s index.
- Re-run the same categorized index pattern this session already applied to `README.md`.

**Step 7 — Additive, do whenever convenient (not blocking, not related to the move):**
- Add `LICENSE` once Step 0's decision is made.
- Add `.github/ISSUE_TEMPLATE/`, `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml` (already tracked, just not yet created).
- Add `.editorconfig` and `.vscode/{settings,extensions}.json` if desired.
- `CONTRIBUTING.md` / `CHANGELOG.md` stay deferred to Phase 17 as already planned.

---

## 7. Considered and Rejected

Documented here so the reasoning isn't lost and doesn't get re-litigated from scratch later:

- **Renaming `app/agents/` to `app/orchestration/`** — clearer intent, but heavy churn (referenced by name across a dozen+ docs) for marginal clarity gain. Rejected.
- **Subdividing `docs/architecture/` by subsystem** — no clear classification for cross-cutting docs (security, performance, testing); flat folder is still easy to scan at this count. Rejected for now (§4).
- **A root-level `scripts/` or `infra/` folder** — `PROJECT_MASTER_SPEC.md` §7 already explicitly considered and rejected this ("there is no root-level `infra/` or `scripts/`"); this report doesn't reopen it.
- **Picking a specific license** — outside what a coding agent should decide unilaterally; flagged as an open question (§3.4, §6 Step 0) rather than resolved here.
