# TASKS

Granular, actionable backlog — distinct from `PROGRESS.md`, which tracks phase-level status. Items here are specific enough to pick up directly. Check off and move to `CHANGELOG.md` when done; delete if superseded.

## Phase 15 (Deployment Pipeline) — resolved 2026-08-07; 9/10 acceptance criteria met

CI/CD workflows (`test.yml`/`security.yml`/`release.yml`/`dependabot.yml`), app icons, `entitlements.mac.plist`, `auto-updater.ts`, a hardened backend `Dockerfile`, and an unplanned-but-necessary Electron 32→39 security upgrade — see `CHANGELOG.md`/`PROGRESS.md`. What's left:

- [ ] **Signed + notarized macOS builds** — needs a real Apple Developer account (cost/legal decision, not something a coding session provisions unilaterally). Config path (`entitlements.mac.plist`, `mac.notarize` toggle, `release.yml`'s `APPLE_ID`/etc. env vars) is fully wired and would work the moment real credentials exist.
- [ ] **No actual GitHub Actions run of any of the three new workflows** — needs a real push to the repository's remote. Every command inside them was run for real in this repository and passes (`pnpm lint`/`typecheck`/`test`/`build`, `docker build`, `pip-audit`, `pnpm audit`), but the workflow YAML itself (trigger wiring, `workflow_call` job dependencies, matrix builds) is unexercised by an actual runner. First thing to check once this is pushed.
- [ ] Windows code signing — same category as macOS notarization, needs a real certificate (cost decision). `certificateSubjectName` env var is wired, nothing to provision it yet.
- [ ] The programmatically-generated app icon (`build/icon.ico`/`.icns`/`icons/*.png`) is a real, deliberate mark (not a placeholder image) but not reviewed brand design — replace whenever real branding is decided; nothing downstream depends on its specific appearance.
- [ ] `pnpm audit`'s remaining 3 moderate-severity findings (all in `vite`'s own dependency tree, below this repo's `--audit-level=high` CI gate) weren't individually chased down — `security.yml`'s gate is deliberately `high`+ only, to avoid blocking PRs on low-severity transitive noise; revisit if the project wants a stricter bar.
- [ ] Electron 39.8.10 was a deliberate minimum-fix choice over latest (43.x) to bound compatibility risk — worth a dedicated future upgrade pass (with real display-based GUI testing, unlike this session's process-launch-only verification) rather than repeatedly minimum-patching every time a new CVE lands on whatever major this project sits on.
- [ ] No E2E test exercises the actual packaged app end-to-end (open folder → edit → save → git commit → agent task, etc.) — this session's packaged-binary launch test only confirms the process starts without crashing, not that any feature actually works once a window would render. Real GUI verification remains blocked on a display server.

## Phase 14 (Docker Integration) — resolved 2026-08-06; 5/5 acceptance criteria met

`DockerService`/`DockerLogStreamManager` (real CLI subprocess, verified against a real Docker daemon), `pty-manager.ts`'s `docker exec` shell reuse, and a desktop `DockerPanel` — see `CHANGELOG.md`. What's left:

- [ ] No visual/interactive verification of the rendered Docker panel in a running app — no display server in this environment, same standing gap as the rest of the desktop shell.
- [ ] No `docker rm`/remove action — the roadmap doc's own Docker panel feature list only calls for list/start/stop/restart/logs/shell, so this wasn't built speculatively. Add if a real need shows up.
- [ ] Kubernetes integration is explicitly out of scope for v1.0 per `phase-14-docker-integration.md`'s own Objective line — not a gap, a documented non-goal.
- [ ] `DockerLogStreamManager`/`PtyManager` both broadcast to every open `BrowserWindow` — same known single-window limitation already tracked below for `PtyManager` alone; the two will need to become window-scoped together, not separately, once multi-window support exists.
- [ ] **Correction, not a deferral:** the task-tracking state at the start of the 2026-08-06 session claimed Phase 1 (ADRs), Phase 2 (barrel exports), Phase 15 (CI workflows), and part of Phase 12 (branch switcher/commit log/push-pull UI) were already complete. None of that work actually existed in the repository — verified against real file presence before Phase 14 was picked up, and the false completions were not carried forward. Those items are still genuinely open; see their respective sections below.

## Deferred from Phase 3 (desktop shell), still open

Each was explicitly scoped out with a reason — see `PROGRESS.md` Phase 3 notes for the full rationale. **2026-08-05: `app-menu.ts`, the Settings UI panel, `safeStorage` token persistence, `protocol-handler.ts`, and drag-and-drop workspace open are all now done** — see `CHANGELOG.md`. What's left:

- [ ] LSP integration: `electron/main/lsp-manager.ts`, `src/features/editor/lsp-client.ts`, bundle TypeScript/Python/JSON language servers. Largest remaining Phase 3 item — treat as its own slice.
- [ ] `electron/main/auto-updater.ts` — realistically Phase 15/Deployment work (needs a real release channel).
- [ ] Refactor `electron/main/index.ts` into `window-manager.ts` + `ipc-registry.ts` (pure architectural cleanup, no attached acceptance criterion).
- [ ] Test coverage still missing: `MonacoEditor`, `FileTree`/`FileTreeNode` (rename/delete/context-menu logic), `file-handlers.ts`/`shell-handlers.ts` IPC modules, 6 of 9 design-system primitives (`Input`, `Tooltip`, `Dialog`, `ScrollArea`, `Badge`, `ContextMenu`).

## Follow-ups discovered during self-review

- [x] **Resolved 2026-08-07 (Phase 15), root cause was different from what this entry assumed:** not an `eslint-plugin-react-hooks` flat-config export problem — the plugin's `configs.recommended.rules` always contained the correctly-prefixed rule id. The real cause: ESLint 9's inline `eslint-disable-next-line` validation fails to find a plugin's rules when that plugin's config block uses an anchored, multi-literal-segment `files` glob (`apps/desktop/src/**/*.{ts,tsx}`) alongside `typescript-eslint`'s `configs.recommended`. Fixed by broadening the glob to `**/src/**/*.{ts,tsx}` — see `PROGRESS.md`'s Phase 15 entry and Decisions Log for the full bisection. This also means the real `pnpm lint` command (`eslint . --config ../../eslint.config.js`) had never actually been run to completion by any prior session before Phase 15 — every earlier "lint clean" claim used a narrower glob that happened to avoid the affected file.
- [ ] `MonacoEditor`'s `viewStatesRef` cache is never pruned (only `modelsRef` is, on file close) — unbounded but bounded-in-practice growth across a very long single session (one entry per distinct file path ever opened). Not worth fixing until it's an actual problem.
- [ ] Everything built this session that renders a window has only been verified via typecheck/lint/build/unit-tests — **no visual/interactive verification**, because this environment has no display server. First priority when a display is available: actually launch `pnpm dev` and click through the IDE shell, command palette, theme toggle, and terminal.
- [ ] `PtyManager.broadcast()` (and, as of Phase 14, `DockerLogStreamManager`'s identical helper) sends to every open `BrowserWindow` — harmless today (one window), but will double-deliver terminal/log output once multi-window support (`WORKSPACE_MANAGEMENT.md` §9) exists. Needs to become window-scoped when that's built, not before.
- [ ] No logging infrastructure exists in the Electron main process (only ad-hoc `console.*` calls added for PTY lifecycle this pass, since nothing better existed to use) — worth a real decision (structured logging library? plain `console` with a consistent prefix convention?) before it grows ad hoc across more files.
- [ ] "Copy Path" produces a mixed-separator path on Windows (OS-native `workspaceRoot` + forward-slash-normalized relative path). Minor, not fixed — would need platform-aware joining, ideally computed in the main process where `path.win32`/`path.posix` are available rather than in the renderer.
- [ ] Per-`FileTreeNode` `Dialog` instances (one delete-confirmation dialog per row, inert until opened) work fine today since the tree isn't virtualized, but would be worth lifting to a single shared dialog at the tree root if virtualization is ever added.

## Discovered during the 2026-08-03 Repository Review (PROGRESS.md accuracy pass)

Verified against the repository rather than assumed — see `PROGRESS.md` for full context on each.

- [ ] Barrel `index.ts` files exist for only 2 of the many `apps/desktop/src/` modules (`components/ui/`, `store/`) — Phase 2's "barrel export files for all modules" deliverable is essentially unstarted.
- [x] Pydantic request/response schema files under `apps/backend/app/api/v1/` — resolved by Phase 6's `auth.py`, `workspaces.py`, Phase 9's `models.py`, and Phase 8's `agents.py`. Still none for chat/git/search, since those routers don't exist yet.
- [ ] No CI/CD workflows exist — `.github/workflows/` contains only a `README.md`, zero actual workflow YAML files.

## Phase 4, 5 & 6 (Backend Foundation, Database Layer, Authentication) — resolved this session (2026-08-04)

Error hierarchy, rate limiter, DB/Redis DI, domain models/ports, all 10 tables, migrations, 7 repositories, full auth flow (register/login/refresh-rotation/reuse-detection/logout/OAuth2) — see `CHANGELOG.md`. What's left, all explicitly out of this pass's scope rather than overlooked:

- [ ] `VectorStore.search`/`upsert`/`delete` require a non-optional `workspace_id: UUID`, so global memories (`workspace_id IS NULL`, `MEMORY_SYSTEM.md` §9) aren't reachable through `MemoryRepository` yet. No use case needs it in this phase; widen the Protocol (or add a parallel global-memory method) once one does.
- [ ] `idx_workspaces_last_opened` is a plain ascending index on `(user_id, last_opened_at)`; `DATABASE_DESIGN.md` specifies `last_opened_at DESC`. SQLAlchemy's declarative `Index()` needs the column referenced post-class-definition to express per-column sort order — skipped for now since it's a minor perf-tuning gap, not a correctness one.
- [ ] `httpx`-via-`starlette.testclient` deprecation warning ("install `httpx2` instead") shows up in every backend test run. Not chased down — unclear whether `httpx2` is something to actually adopt yet or bleeding-edge noise; worth a look next time backend deps are touched.
- [ ] No domain-model/Pydantic-schema audit repository or `AgentAuditLogModel` exists — mentioned in `app/infrastructure/db/repositories/README.md`'s file list but not in `DATABASE_DESIGN.md`'s 10-table schema nor `phase-05-database-layer.md`'s. Deferred to whichever phase (likely 8, Agent Framework) actually introduces agent approval audit logging.
- [ ] **Live GitHub/Google OAuth round-trip is untested** — needs a real registered OAuth app (client id/secret), which is an external account/business decision, not something this session can create unilaterally. Exchange logic is fully built and unit-tested against a mocked `httpx` transport; only the literal live-provider call is unverified. If real OAuth app credentials become available, this is the first thing to manually verify.
- [ ] `RegisterUseCase`/`LoginUseCase`/`RefreshTokenUseCase` type-hint their `auth_repo` parameter as the concrete `AuthRepository` class, not a `Protocol` port, since no `domain/ports/auth_repository.py` exists (refresh tokens were deliberately kept out of the domain layer, see Phase 5's Decisions Log entry). Fine today; would need a port if a second `AuthRepository` implementation is ever needed for testing without a real/fake DB.
- [ ] The OAuth `state` CSRF nonce (`build_authorize_url`) is generated but not yet stored/verified anywhere — the desktop app's OAuth UX (embedded browser view vs. system browser + local callback) still hasn't been designed; `AuthDialog.tsx` only does local email/password auth, not GitHub/Google. Revisit once that flow is designed.

## Phase 7 (WebSocket Gateway) — resolved this session (2026-08-04); code-complete, live verification remains

Gateway, `ConnectionManager`, Redis pub/sub routing, publisher, desktop `ws-client.ts`/`useWebSocket.ts`/`ws-slice.ts`, `workspaces.py`, `App.tsx`'s connect-on-open wiring, and a desktop login/register UI (`features/auth/AuthDialog.tsx`) are all built and tested — see `CHANGELOG.md`. The chain is closed end-to-end at the code level. What's left:

- [ ] **Live interactive verification** (sign in → open a folder → confirm the WS connection actually establishes) — needs a real display, which this environment doesn't have. First thing to check the next time this runs on a machine with one.
- [x] Access token persistence across app restarts — found already done (2026-08-05): `electron/main/auth-storage.ts` (`safeStorage`) + `auth-slice.ts`'s `restoreSession()`/`persistSession()`, called from `App.tsx` at startup. 15 tests.
- [ ] Stale-connection 30s idle timeout (`IDLE_TIMEOUT_SECONDS` in `gateway.py`) is implemented but not test-verified — would need either a 30+ second test or making the timeout constructor-injectable for tests. Neither done this pass.
- [x] Desktop production bundle — re-verified clean (2026-08-05), including after the `protocol-handler.ts` change.
- [ ] `WorkspaceRepository`/ports' `get_by_user_and_root_path` method has no DB-level uniqueness constraint backing the invariant it implements (idempotent-create relies entirely on the application-layer lookup-before-insert). A `UNIQUE (user_id, root_path)` constraint would make this race-proof under concurrent requests; deferred as a real migration decision, not urgent at current scale (one desktop client per user in practice).

## Phase 11 (Terminal) — resolved this session (2026-08-04), two items remain

`PtyManager` unit tests, `terminal-handlers.ts` IPC validation tests, OSC-0 tab-title updates, and `electron-builder.config.ts`/`asarUnpack` are all done — see `CHANGELOG.md`. What's left:

- [ ] Confirm the WebGL renderer actually activates (`xterm.js` `options.rendererType`) and measure input lag (<10ms target) — both require a real display server, which this environment doesn't have. First thing to check the next time this runs on a machine with a display.
- [ ] Manual integration tests (`vim`, `htop`, `python3` in the embedded terminal) and the 10K-character paste performance test from `phase-11-terminal.md`'s Testing Strategy — same display dependency.
- [ ] Terminal: URL/path link detection in output (clickable links) — not part of Phase 11's formal acceptance criteria, but a natural next enhancement (`@xterm/addon-web-links`).
- [ ] An "Agent Terminal" tab that shows the agent's own `run_command` tool calls live in the embedded terminal, rather than only as `agent_step` events in a future Agent Panel — Phase 8's `run_command` tool itself is done now (see below), this is a UI-integration idea, not a backend gap.

## Phase 9 (Model Router) — resolved this session (2026-08-04); all acceptance criteria met, a few real follow-ups remain

Four `AIProvider` implementations, `ModelRouter`, `context_manager.py`, `tokenizer_registry.py`, `EmbeddingService`, `ProviderAvailabilityChecker`, `GET /api/v1/models` — see `CHANGELOG.md`. Unlike every other phase this session, all 11 of `phase-09-model-router.md`'s acceptance criteria are met and verified, not partially deferred. What's left, all explicitly out of this pass's scope:

- [ ] **Live round-trip verification against real paid cloud APIs** (Anthropic/OpenAI/Gemini) — needs real API keys, an account/cost decision outside what this session can do unilaterally, same category as Phase 6's live GitHub OAuth gap. Every acceptance criterion about *behavior when a key is configured* is verified against a mocked-but-real HTTP layer (`httpx.MockTransport`) instead; only the literal live-provider call is unverified. `OllamaProvider.is_available()` was checked against this machine's real (absent) local server, confirming the negative case for real — the positive case (an actual running Ollama instance) is also unverified here.
- [ ] `GeminiProvider._to_content()`'s tool-result conversion uses `tool_call_id` as the function *name* Gemini's `function_response` part requires, since the shared `Message` dataclass (role="tool", tool_call_id=...) doesn't carry the original function name the way Anthropic/OpenAI's id-keyed tool results don't need to. **Now a live fidelity gap, not just a hypothetical one:** Phase 8's agent loop (`base_agent.py`) calls `model_router.complete(..., tools=...)` for real, so any agent task actually routed to a Gemini model will hit this. No test currently exercises an agent task against `GeminiProvider` specifically (Phase 8's tests use a fake/mocked router) — worth fixing before Gemini is offered as an agent-task model, not just noted.
- [ ] `tokenizer_registry.py`'s Hugging Face family mapping only covers 4 families (`qwen2`, `llama`, `mistral`, `deepseek2`) — any other Ollama model family falls back to the `tiktoken` `cl100k_base` approximation rather than a family-specific tokenizer. Expand the table as new local models are actually adopted, not speculatively.
- [ ] `AnthropicProvider.count_tokens()`/`GeminiProvider.count_tokens()` use a `len(text)//4` heuristic — neither provider publishes a local tokenizer (both tokenize server-side; Anthropic's real `count_tokens` API is async, but `AIProvider.count_tokens()` is a synchronous port method). Accurate enough to drive `context_manager`'s truncation decisions, not accurate enough for exact billing/budget math — fine for the current use, worth revisiting if a feature ever needs the latter.
- [ ] `GET /api/v1/models`'s catalog is the static `CONTEXT_WINDOWS` table in `context_manager.py`, not a live federated list from each provider's own "list my available models" API (which would return far more than the curated set this app knows how to route/price). Correct for now — `CONTEXT_WINDOWS` is the same table the router itself uses to make truncation decisions, so "known to the app" and "listed" are the same set — but would need rethinking if the catalog needs to reflect e.g. a user's actual Ollama-installed models dynamically.

## Phase 8 (Agent Framework, backend) — resolved this session (2026-08-05); 14/16 acceptance criteria met

`BaseAgent` (ReAct loop + 5 guards), 13 tools, human approval gate, `agent_task_steps`/`agent_audit_log` persistence, orchestrator sub-agent protocol, `/api/v1/agents` — see `CHANGELOG.md`. This code already existed when this session started but had never been reconciled against `PROGRESS.md`/`CHANGELOG.md`/`TASKS.md` (all three still said "not started"); this session independently re-verified it (284 backend tests, zero-error mypy/ruff, direct security-path code reading) before crediting it, and fixed real documentation drift the verification surfaced. What's left:

- [ ] `browser_tools.py` (`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`) — blocked on Phase 13 (Browser)'s Playwright backend, which doesn't exist yet. This is also what blocks the SSRF-prevention acceptance criterion from being testable.
- [ ] `lsp_tools.py` (`get_diagnostics`) — blocked on a real LSP client, which neither the backend nor `docs/roadmap/phase-03-desktop-application-shell.md`'s still-open LSP item provide yet.
- [x] Desktop Agent Panel UI — built 2026-08-05 (`apps/desktop/src/features/agent/`) alongside Phase 10's `ChatPanel`. Task list, live step timeline, approval-gate UI.
- [ ] Agent task execution runs via `asyncio.create_task()`, not a Celery worker — fine at current scale (one process, no distributed workers), but means agent tasks don't survive a backend process restart, and there's no cross-process task queue. Revisit if/when Celery infrastructure (broker, worker, supervisor) actually gets built for other background work.
- [ ] `GeminiProvider`'s tool-result-conversion gap (see the Phase 9 section above) is now a live risk for any agent task routed to a Gemini model, not just a theoretical one.
- [ ] No coverage-percentage measurement was run against `phase-08-agent-framework.md`'s own 90%-coverage-for-tools target from its Testing Strategy — 284 passing tests is strong evidence, but the actual percentage wasn't computed this pass.
- [ ] The desktop Agent Panel's model/agent-type pickers are hardcoded shortlists (`AGENT_TYPES` in `types/agent.ts`, a `DEFAULT_MODELS` list in `AgentTaskList.tsx`), not live catalogs — same pattern and same reasoning as Phase 10's chat model selector below.

## Phase 10 (AI Chat) — resolved this session (2026-08-05); backend + desktop `ChatPanel`, 9/11 acceptance criteria met

Session/message CRUD, RAG-aware context builder, streaming send-message pipeline, and a full desktop `ChatPanel` (virtualized markdown-rendering message list, streaming assembly via `requestAnimationFrame`-batched deltas, active-file attach, `Ctrl+Shift+C`) — see `CHANGELOG.md`. What's left:

- [ ] Drag-and-drop file attach from the file tree — `ChatInput`'s "attach the file I'm currently looking at" toggle covers the same context need with a simpler interaction; drag-and-drop itself is a separate, bigger UI feature, deferred rather than rushed.
- [ ] Post-session memory extraction (`application/chat/memory_extractor.py`) — needs `memory_classifier.py` (`domain/services/README.md`), which doesn't exist. Same blocking gap as Phase 8's `memory: AgentMemory` field; whichever phase builds fact extraction unblocks both at once.
- [ ] Streaming token usage isn't recorded — `Message.token_count` is `None` for every assistant reply, since `AIProvider.stream()`'s `StreamChunk` has no usage field the way `complete()`'s `CompletionResult` does. Would need either a provider-specific final usage chunk or a separate `count_tokens()` call after the stream ends.
- [ ] RAG results are only as good as what's indexed, and nothing indexes a workspace yet — `code_embeddings` stays empty until Phase 4's deferred `/workspaces/{id}/index` (or equivalent) actually gets built. `EmbeddingRepository.search()` itself is real and tested; it just has nothing to find yet on a fresh workspace.
- [ ] "Recently opened files" and "active terminal output" from `AI_ARCHITECTURE.md` §4's workspace-context list were not built into `context_builder.py` — the backend has no visibility into desktop UI state beyond `active_file` (now wired end-to-end) without new IPC/API plumbing.
- [ ] No live round-trip test against a real Ollama/cloud model exists for the chat streaming path specifically (Phase 9's own provider tests cover the provider layer; Phase 10's tests use a scripted fake router) — same account/environment-blocked category as Phase 6's OAuth gap and Phase 9's live-API gaps.
- [ ] The desktop model selector (`ChatSessionList.tsx`'s `DEFAULT_MODELS`) is a hardcoded shortlist chosen once per session at creation time, not a live `GET /api/v1/models` fetch and not a per-message switch — no desktop model-catalog client exists yet. A real "list available models" desktop feature would replace this.
- [ ] No visual/interactive verification of `ChatPanel`/`AgentPanel` in a real running app — this environment has no display server, same standing gap as the rest of the desktop shell (Phase 3's notes, `TASKS.md`'s "Follow-ups discovered during self-review" section below). `tsc --noEmit`, `eslint`, 95 passing vitest tests, and a real production `pnpm build` (both panels land as separate lazy-loaded chunks) are the verification that exists; actually clicking through sign-in → open folder → send a chat message → watch it stream has not been done.

## Phase 3 gap-closing + repository re-verification — resolved this session (2026-08-05)

`protocol-handler.ts` and drag-and-drop workspace open are new; `safeStorage` persistence, the Settings UI panel, and the native app menu were found already built — see `CHANGELOG.md`, `PROGRESS.md`'s Phase 3 entry. What's left:

- [ ] **Known flaky integration test, investigated, not fixed:** an intermittent 401 shows up on whichever test happens to register two users back-to-back, but only inside the full 79-test `pytest tests/integration` run — never in isolation, never in a 15-trial direct repro script (register → `/me` twice, against real Postgres/Redis, outside pytest). Points to test-harness resource pressure (each integration test builds + disposes its own SQLAlchemy engine against one shared session-scoped testcontainer, ~79 times per run) rather than an application bug in the auth path itself. If this needs to be root-caused for real, the next step would be reducing per-test engine churn (e.g. a session-scoped engine with per-test `AsyncSession`s) rather than more auth-path investigation.
- [ ] Remaining desktop test-coverage gaps are tracked under "Deferred from Phase 3" above (`MonacoEditor`, `FileTree`/`FileTreeNode`, `file-handlers.ts`/`shell-handlers.ts`, 6 of 9 design-system primitives).

## Phase 12 (Git Integration) — resolved this session (2026-08-05); 8/10 acceptance criteria met

`GitService`, git-status parsing, the desktop Git panel (status/diff/commit/conflicts), and AI commit-message generation — see `CHANGELOG.md`. What's left:

- [ ] Inline in-editor conflict-marker highlighting — built instead as a dedicated `ConflictResolver.tsx` panel with real per-block accept actions (the roadmap doc's own file list already names this component separately, so this is the intended shape, not a shortcut). Revisit only if a future design review specifically wants inline decorations *in addition to* the panel.
- [ ] `DiffViewer.tsx`'s content-loading effect (fetches `git show HEAD:path` + the staged/working-tree "after" version, then calls `setModel()`) has no dedicated automated test — blocked by the same `monaco-editor` dynamic-import resolution failure under Vitest/Vite that's kept `MonacoEditor.tsx` untested since Phase 3. **Worth fixing once, not per-component:** whatever unblocks `MonacoEditor.tsx`'s tests (a `monaco-editor` mock, an `optimizeDeps`/alias tweak, or similar) will also unblock this. Until then, `GitPanel.test.tsx` mocks `useMonaco` to `() => null` to test everything else in the feature.
- [ ] Live/interactive verification of the Git panel (branch switching, a real merge conflict walked through the UI, the diff viewer actually rendering) — no display server in this environment, same standing gap as the rest of the desktop shell.
- [ ] `git push`/`git pull` are implemented in `GitService` and exposed via IPC (`window.rasik.git.push`/`.pull`) but have no UI entry point yet (no button calls them) — deliberately out of this pass's scope; the roadmap doc's own UI spec (status panel, diff viewer, commit panel, conflict resolver) doesn't call for one either, but a real Git panel eventually needs push/pull/fetch surfaced somewhere.
- [ ] No branch-switcher UI — `GitService.branches()`/`checkoutBranch()` and `gitBranches` state exist in `git-slice.ts`, but nothing in `GitPanel.tsx` renders a branch list or dropdown yet. `StatusBar`'s branch display is read-only (click opens the Git panel, not a branch picker).
- [ ] No commit log / history view — `GitService.log()` exists and is tested, but nothing in the UI calls it yet.
- [ ] Assumes the git repository root coincides with (or is an ancestor of) the open workspace root — correct by construction (`GitService`'s `cwd` is always the workspace root, and git itself resolves upward to find `.git` and reports paths relative to `cwd`), but never explicitly tested against a workspace opened as a subdirectory of a larger repo.

## Phase 13 (Browser) — resolved this session (2026-08-05); all 9 acceptance criteria met

`PlaywrightBrowserService`, SSRF guard, 5 agent browser tools, and a desktop `WebContentsView` panel — see `CHANGELOG.md`. What's left:

- [ ] No visual/interactive verification of the rendered browser panel in a real running app — no display server in this environment, same standing gap as the rest of the desktop shell. Real headless-Chromium *behavior* (navigate/screenshot/click/type/SSRF) was verified for real, independent of this gap — see `PROGRESS.md`'s Phase 13 entry.
- [ ] The Docker image build now takes noticeably longer and is several hundred MB larger (`playwright install --with-deps chromium` downloads Chromium + system libraries) — not measured precisely, worth keeping an eye on if backend image build/deploy time becomes a real concern.
- [ ] `DEPLOYMENT_GUIDE.md` §9's embedded Dockerfile snippet has drift from the real `apps/backend/Dockerfile` that predates this session (uses `gunicorn` instead of `uvicorn`, copies `alembic/` that the real file doesn't) — flagged inline in that section rather than fully reconciled, since it's pre-existing and unrelated to Phase 13's own change.
- [ ] No branch/URL history, bookmarks, or multi-tab support in the interactive Browser panel — not part of `phase-13-browser.md`'s own acceptance criteria, a natural future enhancement if the feature sees real use.
- [ ] `PlaywrightBrowserService` has no per-workspace concurrency limit or total-workspace cap — a workspace opening many browser-using agent tasks in parallel could spawn multiple Chromium processes for that one workspace's tool calls if `navigate()`/`click()`/etc. race before the first `_get_page()` call completes (the `asyncio.Lock` prevents a literal duplicate-launch race, but nothing caps how many *workspaces* can have a browser open at once). Not a correctness bug, a resource-usage one — worth a cap if this becomes a real multi-tenant concern.

## Housekeeping

- [ ] `docs/reports/2026-08-03-repository-structure-audit.md` proposes moving 21 root docs into `docs/architecture/` — a decision for the user, not yet acted on. If approved, follow the migration plan in that report (it's the largest single step: ~60–100 cross-reference updates).
- [ ] `LICENSE` file is still missing (flagged in the audit above) — a product/legal decision, not something to pick automatically.
- [ ] **All work across every session (Phases 3–11) remains uncommitted in git** — only 2 commits exist in history (initial monorepo bootstrap). Worth committing in logical, phase-sized chunks rather than one enormous diff; the user commits, per `CLAUDE.md`'s Development Rules.
