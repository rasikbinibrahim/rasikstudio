# TASKS

Granular, actionable backlog — distinct from `PROGRESS.md`, which tracks phase-level status. Items here are specific enough to pick up directly. Check off and move to `CHANGELOG.md` when done; delete if superseded.

## Discovered during the 2026-08-12 reference-repository analysis (Phase 1)

Real, previously-untracked gaps surfaced while comparing this project's actual code against
Cline/OpenHands/Continue/Ollama/xterm.js's own designs (`docs/reference/*/`) — each verified
against the real source before being recorded here, not just asserted from the comparison alone.
The cancellation-propagation gap (the most significant) is filed under its own Phase 8 section
above instead of here, since it's specifically an agent-framework gap with an existing home.

- [x] **Resolved 2026-08-13:** a real `ask_followup_question` tool now exists
  (`app/agents/tools/interaction_tools.py`), registered for every agent type. Reuses
  `agents/running_tasks.py`'s existing one-shot Redis `BLPOP` hand-off shape (`wait_for_answer`/
  `submit_answer`, mirroring `wait_for_approval`/`resolve_approval`), publishes a new
  `agent_question_asked` WS event, and `BaseAgent.run()` wraps the call with the same
  `paused`/`running` DB status transition the approval gate already gets. Answered via
  `POST /api/v1/agents/tasks/{id}/answer` (`AnswerAgentQuestionUseCase`). A cancellation mid-wait
  resolves via a synthetic `AgentQuestionCancelled`, caught inside the tool itself rather than
  propagating as an unhandled exception — the same problem `request_cancel`'s approval-key push
  already solved for the approval gate, solved the same way here. Desktop: `AgentQuestionPrompt.tsx`
  (mirrors `AgentApprovalPrompt.tsx`, free-text input instead of approve/deny), wired into
  `AgentStepTimeline.tsx`, `agent-slice.ts`'s `agentPendingQuestion`/`answerAgentQuestion`, and
  `useAiEventBridge.ts`. 8 new backend tests (5 `test_base_agent.py`, 5 `test_answer_question.py`),
  20 new desktop tests (7 `AgentQuestionPrompt.test.tsx`, 6 `agent-slice.test.ts`, 1
  `useAiEventBridge.test.ts`, 1 `agent-client.test.ts`, plus store/hook coverage). Full backend
  suite: 441 passed/3 skipped (91.86% coverage); mypy/ruff clean. (`docs/reference/cline/
  TOOL_DESIGN_NOTES.md`)
- [ ] **No step-level undo for agent file edits** — Cline commits to a hidden shadow git repo
  before each file-modifying tool call, so any step can be reverted. This project's
  `agent_audit_log` records what changed (SHA-256 before/after hashes) but provides no undo
  mechanism — a real, honestly-open gap between "we can prove what happened" and "we can revert
  it." (`docs/reference/cline/ANALYSIS.md` §3, `TOOL_DESIGN_NOTES.md`)
- [x] **Resolved 2026-08-12:** approval denial now carries an optional "why" field —
  `POST /api/v1/agents/{id}/approve`'s `reason: str | null`, threaded through
  `ApproveAgentStepRequest` → `RunningTaskRegistry.resolve_approval()`/`ApprovalDecision`
  (JSON-encoded on the same Redis one-shot hand-off list, `wait_for_approval()` now returns the
  decision object, not a bare bool) → `BaseAgent._await_approval()`, which folds it into the
  denied tool call's own observation ("Action denied by user: wrong file, try b.txt instead")
  so the agent can plan around *why*, not just that it was refused. Desktop:
  `AgentApprovalPrompt.tsx` gained an optional reason input shown next to Approve/Deny. 8 new
  tests (2 backend unit, 1 `base_agent` ReAct-loop test verifying the folded message, 5 desktop
  across `agent-client`/`agent-slice`/`AgentApprovalPrompt`). (`docs/reference/cline/
  APPROVAL_GATE_NOTES.md`)
- [x] **Resolved 2026-08-12:** chat now has a git-diff context source — new
  `app/infrastructure/git/diff.py` (`get_working_tree_diff()`, a real `git diff` subprocess call,
  deliberately *not* shared with the agent's own `git_diff` tool since the two need different
  error semantics — see that module's own docstring), wired into `context_builder.
  build_chat_context()` as an opt-in `include_git_diff`/`workspace_root` pair (mirrors
  `active_file`'s own opt-in shape). `send_message.py` resolves `workspace_root` via a real
  `WorkspaceRepository` lookup (only when opted in) and threads it through.
  `POST /chat/sessions/{id}/messages` gained `include_git_diff: bool`. Desktop: `ChatInput.tsx`
  gained an "Uncommitted changes" toggle next to the existing active-file one. 14 new tests (4
  `infrastructure/git/diff.py` against a real repo, 5 `context_builder`, 1 real end-to-end
  integration test proving an actual `git diff` reaches the model, 4 desktop).
  (`docs/reference/continue/CONTEXT_BUILDING_NOTES.md`)
- [x] **Resolved 2026-08-13:** a real desktop UI to list/pull/remove Ollama models now exists in
  the Settings panel (`OllamaModelsSection.tsx`, shown only when signed in). Backend: new
  `app/infrastructure/ai/ollama_registry.py` (`OllamaRegistry` — kept separate from
  `OllamaProvider`, which implements the `AIProvider` port for *using* a model, not managing the
  install; same constructor-injectable `httpx.AsyncClient` testability pattern), 3 new endpoints
  under `/api/v1/models/ollama/` (`GET /installed`, `POST /pull`, `DELETE /{name}`). `POST /pull`
  is a direct HTTP streaming (NDJSON) response rather than this app's usual WebSocket-event
  pattern — a model pull has no natural workspace to scope a `ws:workspace:{id}:...` channel to
  (Ollama is one shared local server, not a per-workspace resource), so reusing that shape would
  have been the wrong fit. Desktop: `services/ollama-client.ts` consumes the stream via a real
  `ReadableStream` reader, `OllamaModelsSection.tsx` shows live per-line download progress and a
  Remove button per model with its real size. 34 new tests (8 backend unit against
  `httpx.MockTransport`, 13 backend integration — auth-required + real-`503`-when-Ollama-is-
  unreachable, since this environment has no real Ollama server running, same category as Phase
  9's live-cloud-API gaps — 6 desktop `ollama-client.test.ts`, 7 desktop
  `OllamaModelsSection.test.tsx`). Full backend suite: 455 passed/3 skipped (91.81% coverage,
  gate 85%); mypy/ruff clean. (`docs/reference/ollama/ANALYSIS.md` §8)
- [x] **Resolved 2026-08-12:** `SearchAddon` is now reachable from a real UI —
  `useTerminal.ts` exposes real `findNext`/`findPrevious` wrappers around the addon instance
  (previously created and loaded but discarded, never stored), and `TerminalTab.tsx` gained a
  small find bar: `Ctrl`/`Cmd`+`F` opens it (scoped to the focused terminal's own container, not
  a global keybinding — doesn't fire for a hidden/inactive tab), `Enter`/`Shift+Enter` call
  next/previous, `Escape` or the close button dismiss it. 11 new tests (3 `useTerminal` against a
  real xterm.js buffer with real written content, 5 `TerminalTab` UI). (`docs/reference/xterm/
  ADDON_NOTES.md`)

## `monaco-editor` Vitest resolution blocker — resolved 2026-08-12

Real root cause, found and fixed for good — not a mock, not a per-component workaround. Named
across multiple prior sessions' entries as "worth fixing once, not per-component"
(`MonacoEditor.tsx` zero test coverage since Phase 3, `DiffViewer.tsx`'s content-loading effect
untested, `GitPanel.test.tsx` mocking `useMonaco` to sidestep it). The actual failure —
`import('monaco-editor')` throwing "Failed to resolve entry for package" — was Vite's SSR-style
module resolution (what Vitest's transform pipeline uses even for jsdom-environment tests)
defaulting `resolve.mainFields` to `['main']` only; `monaco-editor`'s `package.json` ships *only*
a `"module"` field, no `"main"`/`"exports"`, so there was never a matching field to resolve
against. One line fixes it: `vitest.config.ts`'s renderer project gained
`resolve.mainFields: ['browser', 'module', 'main']`.

That alone unblocks the *import* — actually constructing a real editor needed 5 more real,
narrow jsdom gaps closed in `src/test/setup.ts`, each hit and fixed in sequence by actually
trying to mount a real editor, not guessed in advance:
- `document.queryCommandSupported` (Monaco's clipboard contribution calls it unconditionally at
  module load) — stubbed `false`.
- A minimal fake canvas 2D context (jsdom implements zero canvas rendering, the same category of
  gap `useTerminal.test.ts` already hit for WebGL) — real enough for Monaco's pixel-ratio
  detection and the minimap's own `createImageData`/`getImageData` calls to not crash, including
  a `canvas` back-reference on the context object (real contexts always carry one; Monaco's
  minimap reads `canvasContext.canvas.width` directly).
- `navigator.clipboard` + a global `ClipboardItem` stub (Monaco's clipboard service touches both
  unconditionally on any real document click, not just clicks on the editor itself).
- A targeted `process.on('unhandledRejection', ...)` filter for Monaco's own internal
  `CancellationError` (`name`/`message` both literally `'Canceled'`) — real, intentional
  cooperative-cancellation signaling when a diff editor's background diff computation is still in
  flight at disposal time (no real Web Worker exists under Vitest, so Monaco's own worker facade
  races disposal differently than it would in a real browser); filtered by exact name match, not
  swallowed broadly.

Real, unmocked `monaco-editor` now works fully under Vitest: editor creation, model create/reuse/
dispose, `setModel`/view-state save-restore, and the diff editor (`createDiffEditor`) all verified
working before writing real tests against them. Closed both previously-blocked gaps:
- **`MonacoEditor.test.tsx`** (new, 5 tests) — empty-state placeholder, real editor mount with
  file content loaded, real content edits calling `updateContent`, switching the active file
  swapping the real model, closing a file disposing its real model. Uses `.txt` (plaintext) test
  files deliberately, not `.ts` — Monaco's *TypeScript* language mode lazily loads a separate
  worker-based language-service module via its own AMD-style resolution that doesn't work under
  this environment and isn't part of what this component's own logic actually exercises;
  plaintext has no such worker.
- **`DiffViewer.test.tsx`** (new, 5 tests) — nothing-rendered with no diff target, unstaged diff
  (HEAD + live working-tree file via `files.read`), staged diff (HEAD + index blob via `git show
  :path`, confirming `files.read` is *not* called), a new file's empty "before" instead of
  erroring, closing calls `closeDiff`.

Desktop suite: 590 tests (up from 579), coverage 86.8% (up from 82.04%), both real margin above
the 80% gate. One real regression caught and fixed before it shipped: the `navigator.clipboard`
stub's first draft used a non-writable `Object.defineProperty`, which broke
`FileTreeNode.test.tsx`'s own pre-existing `Object.assign(navigator, { clipboard: ... })`
per-test override — fixed by adding `writable: true`.

## Backend Infrastructure — real Celery (ADR 0004) — resolved 2026-08-11

Not tied to a single roadmap phase — this closes a gap flagged repeatedly across Phases 8, 16, 17,
and 18 (see each phase's own section below). `app/core/celery_app.py` (real broker/result backend,
`--pool=threads`), `app/tasks/agent_tasks.py` (`run_agent_task`, the Celery entrypoint
`RunAgentTaskUseCase` now dispatches to), `agents/running_tasks.py` rewritten Redis-backed for
cross-process cancellation/approval, `docker-compose.yml`'s new `worker` service, `make worker` for
local dev. See `CHANGELOG.md` and ADR 0004's Outcome for the full writeup, including why chat
message streaming deliberately did *not* move to Celery. What's left:

- [x] **Resolved 2026-08-11, same day:** the workspace RAG indexing pipeline — the other real
  consumer ADR 0004's Context section named alongside agent tasks. `app/tasks/indexing_tasks.py`
  (Celery entrypoint), `app/infrastructure/rag/indexer.py` (walks a workspace, chunks files via
  `domain/services/chunker.py`, embeds and upserts into `code_embeddings`, reconciles deletions),
  `POST /workspaces/{id}/index` (`IndexWorkspaceUseCase`). Chunk-level SHA-256 content-hash dedup
  means a full re-index never re-embeds unchanged content (a separate file-level `(mtime, size)`
  pre-check to also skip the read+chunk step was a distinct, smaller optimization, not a
  correctness gap — see below; resolved the same day). 19 new tests (12 integration against real
  Postgres+Redis+a scripted embedding provider, 7 unit for the pure chunker), all real. See
  `CHANGELOG.md` and `RAG_SYSTEM.md`'s implementation-status note for the complete real-vs-deferred
  breakdown.
- [x] **Resolved 2026-08-12:** **File-level `(mtime, size)` pre-check** — `PERFORMANCE_GUIDE.md`
  §1's original ask. New `indexed_files` table (`IndexedFileModel`,
  `alembic/versions/0004_b94e63a41227_add_indexed_files_table.py`, real up/down/up cycle verified
  against Dockerized Postgres) stores one `(mtime, size_bytes)` row per file per workspace.
  `index_workspace()` now fetches the whole workspace's metadata once per run, then compares a
  fresh `os.stat()` per file against it *before* reading/decoding/chunking — a file whose stat
  matches is skipped entirely, not just spared the embedding call the pre-existing per-chunk
  `content_hash` dedup already avoided. `IndexResult` gained `files_skipped_unchanged` to make the
  skip count directly observable. Stale-file cleanup (a file deleted from disk) now also deletes
  its `indexed_files` row, not just its `code_embeddings` rows, via a new
  `delete_file_index_metadata()` repository method — otherwise a file later re-created at the exact
  same path/mtime/size (e.g. after a `git checkout` of an old commit) would be wrongly skipped as
  "unchanged" despite having no embeddings at all. Deliberately stat-based, not content-hash-based:
  touching a file's mtime with byte-identical content still forces a re-read (documented and
  tested as an accepted tradeoff, not a bug) — cheap insurance against the alternative, a false
  "unchanged" positive from a content-addressed cache colliding on stale disk state. 5 new
  integration tests (`TestFileLevelPreCheck` in `tests/integration/rag/test_indexer.py`, all
  against real Postgres/Redis/filesystem — no mocked stat calls), all 9 pre-existing indexer tests
  still pass unmodified. Full backend suite: 431 passed, 3 skipped, 91.64% coverage; mypy/ruff
  clean.
- [ ] **Tree-sitter AST-aware chunking** — RAG_SYSTEM.md §3.3's other documented strategy
  (`chunk_by_ast`, chunking by top-level function/class declarations instead of fixed token
  windows). Only the fixed-size fallback is built. Needs a tree-sitter grammar per supported
  language — real, additional scope, not a quick follow-on to the fixed-size chunker.
- [x] **Resolved 2026-08-13 (partial — open-time trigger only):** a workspace now auto-indexes
  the moment it becomes backend-synced — `workspace-slice.ts`'s `applyWorkspaceRoot()` (covers
  both `openFolder()` and `openFolderAtPath()`) and `auth-slice.ts`'s `setSession()` (the
  sign-in-after-folder-open ordering) both call `startIndexing()` right after
  `connectWorkspaceSocket()` succeeds. Fire-and-forget, reuses `startIndexing()`'s own error
  handling. 4 new tests (`store/workspace-slice.test.ts`, new file). **Still open:**
  RAG_SYSTEM.md §3.1's file-watcher-triggered incremental re-indexing (on save/add/delete, 5s
  debounce) needs a `chokidar`-equivalent backend service that doesn't exist (same gap
  `open_workspace.py`/`close_workspace.py` are blocked on — see
  `apps/backend/app/application/workspaces/README.md`) — a workspace only re-indexes when the
  user re-opens it or clicks the manual "Index" button again, not on every file save.
- [x] **Resolved 2026-08-12:** desktop UI to trigger indexing and show progress —
  `services/indexing-client.ts` (`POST /workspaces/{id}/index`), `workspace-slice.ts` gained
  `indexingStatus`/`indexingProgress`/`startIndexing()`/`handleIndexProgress()`, wired to the real
  `index_progress` WebSocket event via `useAiEventBridge.ts`. UI is an "Index" button + inline
  progress text in `FileExplorer.tsx`'s header (shown only once `backendWorkspaceId` exists, i.e.
  signed in), not a new dedicated panel — indexing is workspace-wide infra, not its own feature
  surface. This was the last real gap blocking RAG chat context from ever being populated by
  anyone who isn't calling the endpoint directly. 14 new tests (`indexing-client` 3,
  `useAiEventBridge` +1, `FileExplorer` +6 across 5 new describe-block tests).
- [ ] `celery inspect ping`-based Docker healthcheck for the `worker` service was written and
  manually verified against a real running worker, but never exercised through an actual
  `docker compose up` (only `celery -A app.core.celery_app worker` run natively) — worth a real
  `docker build`+`docker compose up` pass before trusting the container healthcheck in production.
- [ ] No `celery beat` service — nothing in this repository schedules periodic work yet (the
  nightly memory-pruning task `MEMORY_SYSTEM.md`/`scripts/README.md` describe, and RAG
  re-indexing, are both still manual/undesigned). ADR 0004 named beat scheduling as one reason to
  prefer Celery over `arq`; it remains available but genuinely unused — add a `beat` service only
  once something real needs to run on a schedule, not speculatively.
- [ ] Celery's own task result backend (`celery_result_backend_url`, Redis DB 1) is configured but
  nothing reads task results back through it yet — `AgentTask.status` in Postgres is still the
  real source of truth for "did this task finish," polled/pushed the same way it always was. The
  Celery result backend is currently only useful for `celery inspect`/monitoring, not application
  logic.

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

- [ ] No visual/interactive verification of the rendered Docker panel in a running app — the "no display server" premise this was filed under turned out to be wrong (2026-08-13, see the Phase 3 entry's resolved item), so this is now a real, unblocked-but-not-yet-done follow-up, not an environment gap.
- [x] **Resolved 2026-08-12:** `docker rm`/remove action — `DockerService.remove()` (`docker rm -f`,
  works on a running container too), `docker:remove` IPC handler, `removeContainer()` in
  `docker-slice.ts` (deselects + stops any active log stream first if the removed container was
  selected), and a Remove button on each `ContainerItem` gated behind a `Dialog` confirmation —
  same destructive-action pattern `FileTreeNode.tsx`'s delete confirmation already established.
  7 new tests (2 IPC, 3 slice, 1 real-Docker `DockerService` test, 1 `DockerPanel` end-to-end).
- [ ] Kubernetes integration is explicitly out of scope for v1.0 per `phase-14-docker-integration.md`'s own Objective line — not a gap, a documented non-goal.
- [ ] `DockerLogStreamManager`/`PtyManager` both broadcast to every open `BrowserWindow` — same known single-window limitation already tracked below for `PtyManager` alone; the two will need to become window-scoped together, not separately, once multi-window support exists.
- [ ] **Correction, not a deferral:** the task-tracking state at the start of the 2026-08-06 session claimed Phase 1 (ADRs), Phase 2 (barrel exports), Phase 15 (CI workflows), and part of Phase 12 (branch switcher/commit log/push-pull UI) were already complete. None of that work actually existed in the repository — verified against real file presence before Phase 14 was picked up, and the false completions were not carried forward. Those items are still genuinely open; see their respective sections below.

## Deferred from Phase 3 (desktop shell), still open

Each was explicitly scoped out with a reason — see `PROGRESS.md` Phase 3 notes for the full rationale. **2026-08-05: `app-menu.ts`, the Settings UI panel, `safeStorage` token persistence, `protocol-handler.ts`, and drag-and-drop workspace open are all now done; 2026-08-07: `auto-updater.ts` (Phase 15); 2026-08-11: LSP integration (`lsp-manager.ts`/`lsp-handlers.ts`/`lsp-client.ts` — hover/go-to-definition/diagnostics for TypeScript/Python/JSON)** — see `CHANGELOG.md`. What's left:

- [x] **Resolved, found already built 2026-08-13:** LSP completion/code-action providers —
  `lsp-client.ts`'s `registerProviders()` already registers
  `registerCompletionItemProvider`/`registerCodeActionProvider` for every LSP-backed Monaco
  language (real `textDocument/completion`/`textDocument/codeAction` requests, snippet-insert-rule
  conversion, quick-fix `WorkspaceEdit` → Monaco `IWorkspaceTextEdit` mapping, bare-`Command`
  actions filtered out rather than shown as dead entries) — undocumented, uncommitted work this
  file and `PROGRESS.md` both still described as "not built" until re-verified against the actual
  code this session, the same drift pattern this project has hit repeatedly (Phase 8, Phase 3
  `safeStorage`/Settings/app-menu, ...). 22 passing tests in `lsp-client.test.ts` already cover
  both providers directly. Not part of this session's own work — crediting real prior work, not
  claiming it as new.
- [ ] Wire Phase 8's `get_diagnostics` agent tool to the new real LSP client — it was previously blocked on "no real LSP client existing"; that block is gone as of 2026-08-11, but the tool itself hasn't been updated yet.
- [ ] Python LSP requires the end user to have `pylsp` or `uv` on their PATH — no bundled Python runtime ships with this app. A real, deliberate scope boundary (see `CHANGELOG.md`'s LSP entry), not a bug — revisit only if bundling a portable Python interpreter is ever prioritized.
- [x] **Resolved 2026-08-11:** Refactored `electron/main/index.ts` into `window-manager.ts` (`BrowserWindow` creation/lifecycle) + `ipc-registry.ts` (all `registerXHandlers()` calls in one place) — `index.ts` is now ~30 lines of pure app-lifecycle wiring. See `CHANGELOG.md`.
- [x] **Resolved 2026-08-12:** `MonacoEditor` — see the dedicated "monaco-editor Vitest blocker" entry below for the real fix and what it unblocked. Remaining, not reverified this pass: `file-handlers.ts`/`shell-handlers.ts` IPC modules, 6 of 9 design-system primitives (`Input`, `Tooltip`, `Dialog`, `ScrollArea`, `Badge`, `ContextMenu`) — `FileTree`/`FileTreeNode` themselves already have real test coverage as of this session (12+ passing tests observed directly), so this line's framing was already partially stale beyond just Monaco; not fully re-audited here.

## Follow-ups discovered during self-review

- [x] **Resolved 2026-08-07 (Phase 15), root cause was different from what this entry assumed:** not an `eslint-plugin-react-hooks` flat-config export problem — the plugin's `configs.recommended.rules` always contained the correctly-prefixed rule id. The real cause: ESLint 9's inline `eslint-disable-next-line` validation fails to find a plugin's rules when that plugin's config block uses an anchored, multi-literal-segment `files` glob (`apps/desktop/src/**/*.{ts,tsx}`) alongside `typescript-eslint`'s `configs.recommended`. Fixed by broadening the glob to `**/src/**/*.{ts,tsx}` — see `PROGRESS.md`'s Phase 15 entry and Decisions Log for the full bisection. This also means the real `pnpm lint` command (`eslint . --config ../../eslint.config.js`) had never actually been run to completion by any prior session before Phase 15 — every earlier "lint clean" claim used a narrower glob that happened to avoid the affected file.
- [ ] `MonacoEditor`'s `viewStatesRef` cache is never pruned (only `modelsRef` is, on file close) — unbounded but bounded-in-practice growth across a very long single session (one entry per distinct file path ever opened). Not worth fixing until it's an actual problem.
- [x] **Resolved 2026-08-13 — the "no display server" premise itself was wrong.** This sandbox
  actually has a real, working display (`DISPLAY=:0`, WSLg) — `xdpyinfo`/`xset q` both respond for
  real. Every prior session's docs assumed otherwise without checking. Electron itself was missing
  3 shared libraries (`libnspr4`/`libnss3`/`libasound2`, the same category Phase 13 hit for
  Playwright's bundled Chromium) — worked around the same way, without root: `apt-get download`
  the `.deb`s, `dpkg-deb -x` them into a local prefix, point `LD_LIBRARY_PATH` at it. With that, a
  real packaged build (`pnpm build`, then Playwright's `_electron.launch()` against
  `out/main/index.js`, the same launch mechanism the E2E suite already uses) actually renders and
  was screenshotted for real: the IDE shell (activity bar, empty-state file explorer, status bar),
  a real folder opened via `openFolderAtPath()`, the file tree populated, a real Python file open
  in Monaco with real syntax highlighting, the command palette (`Ctrl+Shift+P`, real fuzzy list),
  and the embedded terminal with a real live shell prompt. Not a lint/build/unit-test proxy —
  actual pixels, actually inspected. See the Phase 3/11/12 entries below for what this specifically
  unblocked, and `PROGRESS.md`'s new session note for the full writeup. Genuinely still unverified
  this pass (not because of the environment anymore, just not yet exercised): Docker panel,
  Chat/Agent panels, Browser panel, a full sign-in → chat → stream round trip.
- [ ] `PtyManager.broadcast()` (and, as of Phase 14, `DockerLogStreamManager`'s identical helper) sends to every open `BrowserWindow` — harmless today (one window), but will double-deliver terminal/log output once multi-window support (`WORKSPACE_MANAGEMENT.md` §9) exists. Needs to become window-scoped when that's built, not before.
- [ ] No logging infrastructure exists in the Electron main process (only ad-hoc `console.*` calls added for PTY lifecycle this pass, since nothing better existed to use) — worth a real decision (structured logging library? plain `console` with a consistent prefix convention?) before it grows ad hoc across more files.
- [ ] "Copy Path" produces a mixed-separator path on Windows (OS-native `workspaceRoot` + forward-slash-normalized relative path). Minor, not fixed — would need platform-aware joining, ideally computed in the main process where `path.win32`/`path.posix` are available rather than in the renderer.
- [ ] Per-`FileTreeNode` `Dialog` instances (one delete-confirmation dialog per row, inert until opened) work fine today since the tree isn't virtualized, but would be worth lifting to a single shared dialog at the tree root if virtualization is ever added.

## Discovered during the 2026-08-03 Repository Review (PROGRESS.md accuracy pass)

Verified against the repository rather than assumed — see `PROGRESS.md` for full context on each.

- [x] **Resolved 2026-08-11:** Barrel `index.ts` files added for every real (non-empty) `apps/desktop/src/` module beyond `components/ui/`/`store/` — `hooks/`, `services/`, `lib/`, `layout/`, and all 13 non-empty `features/*` subdirectories (`agent`/`auth`/`browser`/`chat`/`command-palette`/`docker`/`editor`/`file-explorer`/`git`/`settings`/`terminal`; `features/search` and `features/extensions` skipped — both are empty scaffolds with nothing to export). `tsc --noEmit`/`eslint` both clean (no export-name collisions), full test suite (548 tests) re-verified green.
- [x] Pydantic request/response schema files under `apps/backend/app/api/v1/` — resolved by Phase 6's `auth.py`, `workspaces.py`, Phase 9's `models.py`, and Phase 8's `agents.py`. Still none for chat/git/search, since those routers don't exist yet.
- [ ] No CI/CD workflows exist — `.github/workflows/` contains only a `README.md`, zero actual workflow YAML files.

## Phase 4, 5 & 6 (Backend Foundation, Database Layer, Authentication) — resolved this session (2026-08-04)

Error hierarchy, rate limiter, DB/Redis DI, domain models/ports, all 10 tables, migrations, 7 repositories, full auth flow (register/login/refresh-rotation/reuse-detection/logout/OAuth2) — see `CHANGELOG.md`. What's left, all explicitly out of this pass's scope rather than overlooked:

- [ ] `VectorStore.search`/`upsert`/`delete` require a non-optional `workspace_id: UUID`, so global memories (`workspace_id IS NULL`, `MEMORY_SYSTEM.md` §9) aren't reachable through `MemoryRepository` yet. No use case needs it in this phase; widen the Protocol (or add a parallel global-memory method) once one does.
- [x] **Resolved 2026-08-12:** `idx_workspaces_last_opened` now sorts `last_opened_at DESC`, matching `DATABASE_DESIGN.md` — `Index("idx_workspaces_last_opened", WorkspaceModel.user_id, WorkspaceModel.last_opened_at.desc())` defined after the class body (referencing the real `InstrumentedAttribute`, not a bare column string), migration `0003_acb1d745f812`. Verified against real Postgres: `\d workspaces` shows `btree (user_id, last_opened_at DESC)`; up/down/up all clean.
- [x] **Resolved 2026-08-12:** investigated for real — `httpx2` is a genuine, separately-published
  PyPI package (`httpx2==2.10.0`, depends on a matching `httpcore2`), not bleeding-edge noise:
  reading Starlette's own `testclient.py` source confirms it's the maintainers' real, intentional
  migration path for the synchronous test-client transport specifically (`import httpx2 as
  httpx`, falling back to plain `httpx` with the deprecation warning only if `httpx2` isn't
  installed). 3 real test files (`test_errors.py`, `test_request_logger.py`,
  `test_rate_limiter.py`) use `starlette.testclient.TestClient`/`fastapi.testclient.TestClient`
  and were triggering the warning on every run. Added `httpx2>=2.10.0` to `[dependency-groups]
  dev` (test-only, not a runtime app dependency) — full backend suite re-verified (415 passed/3
  skipped, unchanged), warning gone from every run.
- [ ] No domain-model/Pydantic-schema audit repository or `AgentAuditLogModel` exists — mentioned in `app/infrastructure/db/repositories/README.md`'s file list but not in `DATABASE_DESIGN.md`'s 10-table schema nor `phase-05-database-layer.md`'s. Deferred to whichever phase (likely 8, Agent Framework) actually introduces agent approval audit logging.
- [ ] **Live GitHub/Google OAuth round-trip is untested** — needs a real registered OAuth app (client id/secret), which is an external account/business decision, not something this session can create unilaterally. Exchange logic is fully built and unit-tested against a mocked `httpx` transport; only the literal live-provider call is unverified. If real OAuth app credentials become available, this is the first thing to manually verify.
- [ ] `RegisterUseCase`/`LoginUseCase`/`RefreshTokenUseCase` type-hint their `auth_repo` parameter as the concrete `AuthRepository` class, not a `Protocol` port, since no `domain/ports/auth_repository.py` exists (refresh tokens were deliberately kept out of the domain layer, see Phase 5's Decisions Log entry). Fine today; would need a port if a second `AuthRepository` implementation is ever needed for testing without a real/fake DB.
- [x] **Resolved 2026-08-12:** the OAuth `state` CSRF nonce is now stored server-side (Redis,
  10-minute TTL, `store_oauth_state`/`consume_oauth_state` in `application/auth/oauth.py`) on
  `/auth/oauth/{provider}` and verified+consumed (single-use) on `/callback`, which now requires
  a `state` query param and fails `401 auth_error` before any token exchange if it's missing,
  unrecognized, or replayed. Previously `state` was generated but never checked against anything,
  a real CSRF gap. `API_SPECIFICATION.md`/`AUTHENTICATION.md`/`docs/api/AUTHENTICATION.md` updated
  to match. 4 new unit tests. The desktop app's own OAuth UX (embedded browser view vs. system
  browser + local callback) still hasn't been designed — `AuthDialog.tsx` still only does local
  email/password auth, not GitHub/Google; that part is unchanged.

## Phase 7 (WebSocket Gateway) — resolved this session (2026-08-04); code-complete, live verification remains

Gateway, `ConnectionManager`, Redis pub/sub routing, publisher, desktop `ws-client.ts`/`useWebSocket.ts`/`ws-slice.ts`, `workspaces.py`, `App.tsx`'s connect-on-open wiring, and a desktop login/register UI (`features/auth/AuthDialog.tsx`) are all built and tested — see `CHANGELOG.md`. The chain is closed end-to-end at the code level. What's left:

- [ ] **Live interactive verification** (sign in → open a folder → confirm the WS connection actually establishes) — needs a real display, which this environment doesn't have. First thing to check the next time this runs on a machine with one.
- [x] Access token persistence across app restarts — found already done (2026-08-05): `electron/main/auth-storage.ts` (`safeStorage`) + `auth-slice.ts`'s `restoreSession()`/`persistSession()`, called from `App.tsx` at startup. 15 tests.
- [ ] Stale-connection 30s idle timeout (`IDLE_TIMEOUT_SECONDS` in `gateway.py`) is implemented but not test-verified — would need either a 30+ second test or making the timeout constructor-injectable for tests. Neither done this pass.
- [x] Desktop production bundle — re-verified clean (2026-08-05), including after the `protocol-handler.ts` change.
- [x] **Resolved 2026-08-12:** `uq_workspaces_user_root_path` (`UNIQUE (user_id, root_path)`,
  migration `0003_acb1d745f812`) now backs `get_by_user_and_root_path`'s invariant at the DB level,
  not just the application-layer lookup-before-insert. `CreateWorkspaceUseCase` catches the
  `IntegrityError` a lost race now raises, rolls back (`WorkspaceRepository.rollback()`, new port
  method), and recovers by reusing the winning row — the same outcome a normal cache-hit would
  produce, not a 500. Verified against real Postgres (up/down/up clean, constraint confirmed via
  `\d workspaces`) plus 5 new unit tests covering the race, a non-race `IntegrityError` (re-raised,
  not swallowed), and the existing find-or-create paths.

## Phase 11 (Terminal) — resolved this session (2026-08-04), two items remain

`PtyManager` unit tests, `terminal-handlers.ts` IPC validation tests, OSC-0 tab-title updates, and `electron-builder.config.ts`/`asarUnpack` are all done — see `CHANGELOG.md`. What's left:

- [x] **Resolved 2026-08-13 (WebGL activation only):** confirmed for real against a real running
  packaged app — after opening the terminal, `document.querySelectorAll('canvas')` finds the
  addon's own canvas (no `xterm-*-layer` class, unlike the DOM-renderer layers) and calling
  `.getContext('webgl2')` on it returns a real, non-null context, not the `try/catch` fallback
  path (`useTerminal.ts`'s `WebglAddon` load). **Still open:** the <10ms input-lag target itself
  needs real interactive input-timing measurement (not just confirming which renderer is active),
  not attempted this pass.
- [ ] Manual integration tests (`vim`, `htop`, `python3` in the embedded terminal) and the 10K-character paste performance test from `phase-11-terminal.md`'s Testing Strategy — same display dependency.
- [ ] Terminal: URL/path link detection in output (clickable links) — not part of Phase 11's formal acceptance criteria, but a natural next enhancement (`@xterm/addon-web-links`).
- [ ] An "Agent Terminal" tab that shows the agent's own `run_command` tool calls live in the embedded terminal, rather than only as `agent_step` events in a future Agent Panel — Phase 8's `run_command` tool itself is done now (see below), this is a UI-integration idea, not a backend gap.

## Phase 9 (Model Router) — resolved this session (2026-08-04); all acceptance criteria met, a few real follow-ups remain

Four `AIProvider` implementations, `ModelRouter`, `context_manager.py`, `tokenizer_registry.py`, `EmbeddingService`, `ProviderAvailabilityChecker`, `GET /api/v1/models` — see `CHANGELOG.md`. Unlike every other phase this session, all 11 of `phase-09-model-router.md`'s acceptance criteria are met and verified, not partially deferred. What's left, all explicitly out of this pass's scope:

- [ ] **Live round-trip verification against real paid cloud APIs** (Anthropic/OpenAI/Gemini) — needs real API keys, an account/cost decision outside what this session can do unilaterally, same category as Phase 6's live GitHub OAuth gap. Every acceptance criterion about *behavior when a key is configured* is verified against a mocked-but-real HTTP layer (`httpx.MockTransport`) instead; only the literal live-provider call is unverified. `OllamaProvider.is_available()` was checked against this machine's real (absent) local server, confirming the negative case for real — the positive case (an actual running Ollama instance) is also unverified here.
- [x] **Resolved 2026-08-12:** `GeminiProvider._to_content()`'s tool-result conversion no longer
  misuses `tool_call_id` (an opaque uuid) as Gemini's function name. `_split_system()` now builds
  an id→name map from every `ToolCall` in the conversation's own `assistant` messages before
  converting anything (`base_agent.py`'s ReAct loop always appends the `assistant` message with
  real tool-call names immediately before the matching `role="tool"` message, so the name is
  always resolvable from history) and `_to_content()` looks the real name up from that map,
  falling back to the raw id only if no matching call exists. 2 new tests
  (`TestToolResultConversion`) verify the real name reaches the request body, and that the
  fallback still works for an orphaned/unmatched id.
- [ ] `tokenizer_registry.py`'s Hugging Face family mapping only covers 4 families (`qwen2`, `llama`, `mistral`, `deepseek2`) — any other Ollama model family falls back to the `tiktoken` `cl100k_base` approximation rather than a family-specific tokenizer. Expand the table as new local models are actually adopted, not speculatively.
- [ ] `AnthropicProvider.count_tokens()`/`GeminiProvider.count_tokens()` use a `len(text)//4` heuristic — neither provider publishes a local tokenizer (both tokenize server-side; Anthropic's real `count_tokens` API is async, but `AIProvider.count_tokens()` is a synchronous port method). Accurate enough to drive `context_manager`'s truncation decisions, not accurate enough for exact billing/budget math — fine for the current use, worth revisiting if a feature ever needs the latter.
- [ ] `GET /api/v1/models`'s catalog is the static `CONTEXT_WINDOWS` table in `context_manager.py`, not a live federated list from each provider's own "list my available models" API (which would return far more than the curated set this app knows how to route/price). Correct for now — `CONTEXT_WINDOWS` is the same table the router itself uses to make truncation decisions, so "known to the app" and "listed" are the same set — but would need rethinking if the catalog needs to reflect e.g. a user's actual Ollama-installed models dynamically.

## Phase 8 (Agent Framework, backend) — resolved this session (2026-08-05); 14/16 acceptance criteria met

`BaseAgent` (ReAct loop + 5 guards), 13 tools, human approval gate, `agent_task_steps`/`agent_audit_log` persistence, orchestrator sub-agent protocol, `/api/v1/agents` — see `CHANGELOG.md`. This code already existed when this session started but had never been reconciled against `PROGRESS.md`/`CHANGELOG.md`/`TASKS.md` (all three still said "not started"); this session independently re-verified it (284 backend tests, zero-error mypy/ruff, direct security-path code reading) before crediting it, and fixed real documentation drift the verification surfaced. What's left:

- [ ] `browser_tools.py` (`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`) — blocked on Phase 13 (Browser)'s Playwright backend, which doesn't exist yet. This is also what blocks the SSRF-prevention acceptance criterion from being testable.
- [ ] `lsp_tools.py` (`get_diagnostics`) — blocked on a real LSP client, which neither the backend nor `docs/roadmap/phase-03-desktop-application-shell.md`'s still-open LSP item provide yet.
- [x] Desktop Agent Panel UI — built 2026-08-05 (`apps/desktop/src/features/agent/`) alongside Phase 10's `ChatPanel`. Task list, live step timeline, approval-gate UI.
- [x] **Resolved 2026-08-11:** Agent task execution now runs on a real Celery worker (ADR 0004) — `RunAgentTaskUseCase.execute()` dispatches via `run_agent_task.delay()` (`app/tasks/agent_tasks.py`), surviving a backend/API-process restart since the queued job lives in Redis, not process memory. `agents/running_tasks.py`'s cancellation/approval registry was rewritten Redis-backed to make cross-process coordination (API process ↔ worker process) actually work. See `CHANGELOG.md`.
- [x] **Resolved 2026-08-12:** `GeminiProvider`'s tool-result-conversion gap (see the Phase 9 section above) is fixed — no longer a live risk for agent tasks routed to a Gemini model.
- [ ] No coverage-percentage measurement was run against `phase-08-agent-framework.md`'s own 90%-coverage-for-tools target from its Testing Strategy — 284 passing tests is strong evidence, but the actual percentage wasn't computed this pass.
- [x] **Resolved 2026-08-12 (model picker only):** `AgentTaskList.tsx`'s model picker is now a
  live `GET /api/v1/models` catalog — see the dedicated entry below (shared with `ChatSessionList.tsx`).
  `AGENT_TYPES` (`types/agent.ts`) remains hardcoded, and genuinely has to for now: no `GET
  /agents/types`-style endpoint exists — `agent_factory.available_agent_types()` is a pure Python
  list with no HTTP route in front of it. A real, separate, smaller follow-up if that's ever built.
- [x] **Resolved 2026-08-12** (found while writing `docs/reference/openhands/MULTI_AGENT_NOTES.md`, verified against the real code before fixing, not just asserted): cancelling a parent orchestrator task now propagates to any in-flight sub-agent it spawned via `create_agent`. `AgentContext` gained `cancellation_chain: tuple[UUID, ...]` (every ancestor task id, nearest first); `agent_factory.run_sub_agent()` passes `(*parent_context.cancellation_chain, parent_context.task_id)` down to `execute_agent_task()`, and `BaseAgent._check_cancelled()` now also heartbeats and checks every ancestor's Redis keys, not just its own — heartbeating ancestors too was necessary, not optional: without it, a sub-agent running longer than `_HEARTBEAT_TTL_SECONDS` (120s) would let its ancestor's heartbeat expire while blocked waiting on it, making `POST /agents/{id}/cancel` spuriously report the still-running parent as "not active." Works transitively through arbitrarily nested delegation (orchestrator → sub-orchestrator → sub-sub-agent), not just one level. 4 new tests.

## Phase 10 (AI Chat) — resolved this session (2026-08-05); backend + desktop `ChatPanel`, 9/11 acceptance criteria met

Session/message CRUD, RAG-aware context builder, streaming send-message pipeline, and a full desktop `ChatPanel` (virtualized markdown-rendering message list, streaming assembly via `requestAnimationFrame`-batched deltas, active-file attach, `Ctrl+Shift+C`) — see `CHANGELOG.md`. What's left:

- [x] **Resolved 2026-08-13:** drag-and-drop file attach from the file tree into chat.
  `FileTreeNode.tsx`'s file rows (not directories) are now `draggable`, setting a new custom
  `application/x-rasik-file-path` MIME type (`lib/file-drag-mime.ts`, shared with the drop side so
  the two can't drift on the literal string) to a workspace-relative path on `dragStart`.
  `ChatInput.tsx` accepts a drop anywhere in its own container, reads the dropped file's real
  content via `window.rasik.files.read()`, and shows it as a removable attachment chip — taking
  priority over the pre-existing "attach active file" toggle if both are somehow set, since an
  explicit drag is a more deliberate action. 6 new tests (2 `FileTreeNode.test.tsx` — draggable
  for a file, not for a directory — 4 `ChatInput.test.tsx` — reads and shows the chip, sends the
  dropped file's content taking priority over the toggle, removes the attachment via its close
  button, ignores a drop with no matching drag data).
- [ ] Post-session memory extraction (`application/chat/memory_extractor.py`) — needs `memory_classifier.py` (`domain/services/README.md`), which doesn't exist. Same blocking gap as Phase 8's `memory: AgentMemory` field; whichever phase builds fact extraction unblocks both at once.
- [x] **Resolved 2026-08-12:** streaming token usage is now recorded — `ModelRouter` gained a
  `count_tokens(messages, model)` passthrough to the resolved provider (the same per-model
  estimate `complete()`/`stream()` already use for context-window truncation), called from
  `send_message.py`'s `stream_chat_reply()` after the stream ends (completion tokens from the
  assembled reply text, prompt tokens from the context that was sent) — a real, separate
  `count_tokens()` call after the fact, the option this entry's own text named as the way to
  close this gap without a provider-specific usage chunk. Computed even for a partial reply that
  errored mid-stream, not just a clean completion. `MessageSchema` gained `token_count` so it's
  now reachable via the API, not just stored in the DB with nothing surfacing it.
  `StreamEndEvent`'s `usage` field is now a real `{"prompt_tokens", "completion_tokens"}` dict
  instead of always `{}`. 6 new tests (2 unit `send_message`, 1 integration, 2 `ModelRouter`, plus
  2 test-double `FakeModelRouter`s updated to implement `count_tokens`).
- [ ] RAG results are only as good as what's indexed, and nothing indexes a workspace yet — `code_embeddings` stays empty until Phase 4's deferred `/workspaces/{id}/index` (or equivalent) actually gets built. `EmbeddingRepository.search()` itself is real and tested; it just has nothing to find yet on a fresh workspace.
- [ ] "Recently opened files" and "active terminal output" from `AI_ARCHITECTURE.md` §4's workspace-context list were not built into `context_builder.py` — the backend has no visibility into desktop UI state beyond `active_file` (now wired end-to-end) without new IPC/API plumbing.
- [ ] No live round-trip test against a real Ollama/cloud model exists for the chat streaming path specifically (Phase 9's own provider tests cover the provider layer; Phase 10's tests use a scripted fake router) — same account/environment-blocked category as Phase 6's OAuth gap and Phase 9's live-API gaps.
- [x] **Resolved 2026-08-12:** the desktop model selector is now a live `GET /api/v1/models`
  catalog, not a hardcoded shortlist. New `services/models-client.ts` + `store/models-slice.ts`
  (`loadModels()` — fetches once per session, silently falls back to each panel's own hardcoded
  list on failure/no-token rather than surfacing an error, the same honest-degradation posture RAG
  search already uses). Both `ChatSessionList.tsx` and `AgentTaskList.tsx` call `loadModels()` on
  mount and prefer the live list once it arrives (an unavailable model shows a `(unavailable)`
  suffix in the chat picker, reflecting `ProviderAvailabilityChecker`'s real 60s background
  check). Still per-session, not a per-message switch — that part of this gap remains open, a
  separate, bigger UI change. 9 new tests (2 `models-client`, 5 `models-slice`, 2 UI across the
  two panels' live-catalog behavior).
- [ ] No visual/interactive verification of `ChatPanel`/`AgentPanel` in a real running app — the "no display server" premise this was filed under turned out to be wrong (2026-08-13, see the Phase 3 entry's resolved item), so this is now a real, unblocked-but-not-yet-done follow-up. `tsc --noEmit`, `eslint`, 95 passing vitest tests, and a real production `pnpm build` (both panels land as separate lazy-loaded chunks) are the verification that exists; actually clicking through sign-in → open folder → send a chat message → watch it stream has not been done — needs a reachable backend + Ollama/cloud model in addition to the display, which this pass's screenshot verification didn't set up.

## Phase 3 gap-closing + repository re-verification — resolved this session (2026-08-05)

`protocol-handler.ts` and drag-and-drop workspace open are new; `safeStorage` persistence, the Settings UI panel, and the native app menu were found already built — see `CHANGELOG.md`, `PROGRESS.md`'s Phase 3 entry. What's left:

- [ ] **Known flaky integration test, investigated, not fixed:** an intermittent 401 shows up on whichever test happens to register two users back-to-back, but only inside the full 79-test `pytest tests/integration` run — never in isolation, never in a 15-trial direct repro script (register → `/me` twice, against real Postgres/Redis, outside pytest). Points to test-harness resource pressure (each integration test builds + disposes its own SQLAlchemy engine against one shared session-scoped testcontainer, ~79 times per run) rather than an application bug in the auth path itself. If this needs to be root-caused for real, the next step would be reducing per-test engine churn (e.g. a session-scoped engine with per-test `AsyncSession`s) rather than more auth-path investigation.
- [ ] **Second known flaky suite, found 2026-08-11:** `tests/integration/api/test_websocket.py::TestEventRouting` — two different tests in this class (`test_shared_event_reaches_every_connection_in_the_workspace`, `test_user_scoped_event_reaches_only_that_user`) each failed once across two separate full-suite runs, but every failure passed cleanly when re-run in isolation. Same likely category as the entry above (shared-resource timing under full-suite load — these tests open real WebSocket connections and assert on real pub/sub event delivery ordering) but not yet root-caused; noting it here rather than re-investigating from scratch next time it's seen.
- [x] `MonacoEditor` — resolved 2026-08-12, see the dedicated "monaco-editor Vitest blocker" entry below. Still open: `file-handlers.ts`/`shell-handlers.ts`, 6 of 9 design-system primitives.
- [ ] **Third known flaky category, found 2026-08-13:** `MonacoEditor.test.tsx`/`DiffViewer.test.tsx` (real `monaco-editor` mount, per the "monaco-editor Vitest blocker" entry below) and `lsp-manager.test.ts` (real spawned `typescript-language-server` process) time out (20s) intermittently on a **full** `pnpm test` run in this sandboxed environment — 5 different tests failed across one full-suite run, a different 3 failed on a second full-suite run minutes later, and every one of them passes cleanly when run in isolation (verified directly: `npx vitest run src/features/editor/lsp-client.test.ts` alone, 22/22 green). Same category as the two entries above — real-process/real-editor-construction work under whole-suite CPU/memory pressure in this specific container, not a logic bug in any of the three files, and not caused by any specific change (observed on unrelated backlog work). Root-causing would need either raising these tests' own timeout under full-suite load specifically, or profiling why this sandbox is slower than whatever machine last ran the full suite clean — not done this pass.

## Phase 12 (Git Integration) — resolved this session (2026-08-05); 8/10 acceptance criteria met

`GitService`, git-status parsing, the desktop Git panel (status/diff/commit/conflicts), and AI commit-message generation — see `CHANGELOG.md`. What's left:

- [ ] Inline in-editor conflict-marker highlighting — built instead as a dedicated `ConflictResolver.tsx` panel with real per-block accept actions (the roadmap doc's own file list already names this component separately, so this is the intended shape, not a shortcut). Revisit only if a future design review specifically wants inline decorations *in addition to* the panel.
- [x] **Resolved 2026-08-12:** `DiffViewer.tsx`'s content-loading effect now has a dedicated test suite (`DiffViewer.test.tsx`, 5 tests, real unmocked Monaco diff editor) — see the "monaco-editor Vitest blocker" entry below for the underlying fix. `GitPanel.test.tsx` still deliberately mocks `useMonaco` to `() => null` — the right, fast choice for testing status/staging/commit UI that doesn't care about the diff editor, not something that needed to change.
- [x] **Resolved 2026-08-13 (partial):** the Git panel itself is now visually verified against a
  real running app — a real workspace with a real uncommitted change showed the correct
  `UNSTAGED (1)` section, the modified file with its real `M` decoration, the current branch
  (`master`) in the status bar, and the Pull/Push/History/commit-message/Generate/Commit controls
  all rendered correctly. **Still open:** branch switching, walking through a real merge conflict,
  and the diff viewer's own rendering weren't exercised this pass — the environment blocker is
  gone, but these specific flows haven't been driven yet.
- [x] **Resolved 2026-08-11:** `git push`/`git pull` UI (header buttons in `GitPanel.tsx`, surfacing the real `git` CLI output), a branch-switcher (`BranchSwitcher.tsx`, a `Dialog`-based picker), and a commit log/history view (`CommitLog.tsx`) — see `CHANGELOG.md`/`PROGRESS.md`'s Phase 12 update. `StatusBar`'s branch display is still read-only (click opens the Git panel) — the picker lives in the Git panel's own header, not the status bar; revisit only if that specific entry point is wanted later.
- [ ] Assumes the git repository root coincides with (or is an ancestor of) the open workspace root — correct by construction (`GitService`'s `cwd` is always the workspace root, and git itself resolves upward to find `.git` and reports paths relative to `cwd`), but never explicitly tested against a workspace opened as a subdirectory of a larger repo.

## Phase 13 (Browser) — resolved this session (2026-08-05); all 9 acceptance criteria met

`PlaywrightBrowserService`, SSRF guard, 5 agent browser tools, and a desktop `WebContentsView` panel — see `CHANGELOG.md`. What's left:

- [ ] No visual/interactive verification of the rendered browser panel in a real running app — the "no display server" premise this was filed under turned out to be wrong (2026-08-13, see the Phase 3 entry's resolved item), so this is now a real, unblocked-but-not-yet-done follow-up. Real headless-Chromium *behavior* (navigate/screenshot/click/type/SSRF) was verified for real, independent of this gap — see `PROGRESS.md`'s Phase 13 entry.
- [ ] The Docker image build now takes noticeably longer and is several hundred MB larger (`playwright install --with-deps chromium` downloads Chromium + system libraries) — not measured precisely, worth keeping an eye on if backend image build/deploy time becomes a real concern.
- [ ] `DEPLOYMENT_GUIDE.md` §9's embedded Dockerfile snippet has drift from the real `apps/backend/Dockerfile` that predates this session (uses `gunicorn` instead of `uvicorn`, copies `alembic/` that the real file doesn't) — flagged inline in that section rather than fully reconciled, since it's pre-existing and unrelated to Phase 13's own change.
- [ ] No branch/URL history, bookmarks, or multi-tab support in the interactive Browser panel — not part of `phase-13-browser.md`'s own acceptance criteria, a natural future enhancement if the feature sees real use.
- [ ] `PlaywrightBrowserService` has no per-workspace concurrency limit or total-workspace cap — a workspace opening many browser-using agent tasks in parallel could spawn multiple Chromium processes for that one workspace's tool calls if `navigate()`/`click()`/etc. race before the first `_get_page()` call completes (the `asyncio.Lock` prevents a literal duplicate-launch race, but nothing caps how many *workspaces* can have a browser open at once). Not a correctness bug, a resource-usage one — worth a cap if this becomes a real multi-tenant concern.

## Phase 18 (Optimization) — resolved 2026-08-11; 5/8 acceptance criteria met + 1 N/A; last of the 18 roadmap phases

All 10 NFR targets measured for real (`PERFORMANCE_GUIDE.md` §1a), one real bundle-size fix applied — see `CHANGELOG.md`/`PROGRESS.md`. What's left:

- [x] **File tree virtualization** — resolved 2026-08-11, same day as the baseline that surfaced it. `useFileTree.ts` now flattens the visible tree into `visibleEntries: {entry, depth}[]` (`useMemo`, recomputed on every expand/collapse), `FileTree.tsx` virtualizes that array with `@tanstack/react-virtual`, `FileTreeNode.tsx` renders exactly one row (no more recursion into its own children). Real re-measurement: 1265ms → 356ms for 1000 files; DOM inspection confirmed only ~45 real DOM rows exist regardless of file count. All existing behavior preserved (context menu, rename/delete, drag-and-drop, git decorations); 553 desktop tests green (4 new in `useFileTree.test.ts`, 2 new in `FileTree.test.tsx`, 1 obsolete test removed from `FileTreeNode.test.tsx`). See `CHANGELOG.md`. **New residual gap, not yet tracked as its own item below**: the remaining 356ms is now dominated by the real `files:list` IPC/disk round trip, not rendering — a distinct bottleneck, unaddressed. Bundle-size tradeoff: 695.59KB → 729.6KB (accepted, see `PERFORMANCE_GUIDE.md` §1a).
- [ ] **`files:list` IPC/disk round trip** — now the dominant cost in file-tree loading (356ms for 1000 real files, surfaced while re-measuring after the virtualization fix above). Not investigated — first thing to check would be whether the round trip is doing more work than necessary (e.g. stat-ing every entry eagerly vs. lazily) or whether IPC serialization overhead for large arrays is the actual cost. Worth a real profile before assuming either.
- [ ] **Initial bundle still over target** — 695.59KB vs. 500KB, investigated with a real analyzer (`ANALYZE=1 pnpm build` → `dist-analyze/renderer-stats.html`), one real fix applied (lazy `Settings`/`AuthDialog`, −8.3KB). Remaining bulk is React/ReactDOM/Zustand/Immer/Radix UI + this app's own always-visible shell code — no further easy extraction found. Would need either accepting the target doesn't fit a full IDE shell's real requirements, or a deeper restructuring (e.g. evaluating whether any currently-eager Radix primitive or shell subcomponent could reasonably defer its own sub-dependencies).
- [ ] **Warm startup** (~1220ms vs. <1s target, ~220ms over) and **file open** (106ms vs. <100ms, 6ms over, one sample) — both real, small misses, neither investigated further this pass. File open specifically deserves more samples before treating the number as reliable.
- [ ] **AI TTFT (local/cloud) and semantic search** — genuinely blocked on infrastructure this environment doesn't have (a running Ollama instance with `qwen2.5-coder:1.5b` pulled, real cloud provider API keys, a real indexed workspace — the last no longer blocked on Celery infrastructure itself, which is real as of 2026-08-11, but still blocked on the workspace RAG indexing pipeline that hasn't been built on top of it yet). First real thing to check once any of these three exist.
- [ ] **Editor keystroke latency and terminal input lag** — need real interactive Chrome DevTools Performance-tab profiling; the CDP/Playwright techniques that worked for the other measurements in this phase don't substitute for frame-by-frame interactive profiling. Needs a real display.
- [ ] Renderer memory was only measured for JS heap (`Performance.getMetrics`/`performance.memory`), not the fuller Chrome Task Manager process-RSS view the acceptance criterion's "measured in Chrome DevTools" phrasing implies — real margin (43MB vs. 400MB target) makes this unlikely to matter, but it's not the literal same measurement.

## Phase 17 (Documentation) — resolved 2026-08-11; 5/6 acceptance criteria met

`CONTRIBUTING.md` + root `Makefile`, all 10 ADRs (real Outcome sections), `packages/desktop-types/` generated for real, `docs/api/`/`docs/user-guide/`/`docs/plugin-authoring/` all built — see `CHANGELOG.md`/`PROGRESS.md`. What's left:

- [ ] The desktop app doesn't import from `@rasik-studio/desktop-types` anywhere — every existing type in `apps/desktop/src/types/*.ts` remains hand-written. Migrating real call sites over to the generated types is a distinct, larger refactor (touches every API call site) than this documentation phase's own scope — a real next step for ADR 0007 to be "fully" implemented, not just "types exist."
- [ ] `packages/desktop-types/src/api.d.ts` is a point-in-time snapshot (generated once, 2026-08-11) — nothing regenerates it automatically on backend schema changes yet (no CI step, no pre-commit hook). `packages/desktop-types/README.md`'s own "Commitment Policy" section says `security.yml` should verify the committed types match the current schema; that verification isn't wired up yet either.
- [x] **Resolved 2026-08-11:** Real Celery infrastructure stood up (ADR 0004) — broker/result backend config (`app/core/celery_app.py`), a real worker deployment target (`docker-compose.yml`'s `worker` service, `make worker` for local dev), agent task execution (`RunAgentTaskUseCase`) swapped over to it. Verified end-to-end for real: a real worker process started, connected to Redis, registered `agent.run_task`, and a real `.delay()`'d task was picked up and executed. Unblocks workspace RAG indexing (`/workspaces/{id}/index`, deferred since Phase 4) — see the new task below.
- [ ] A literal, timed "fresh clone → `make dev` running in under 30 minutes" verification by someone who hasn't seen the project — every individual command was verified working for real this session, but not end-to-end by an uninvolved party.
- [ ] A full broken-link audit across the pre-existing 21 root docs + `docs/roadmap/*.md` — this session's link check covered only files it created/modified.
- [ ] Building an actual plugin runtime (`docs/plugin-authoring/`'s entire subject) is real, substantial, unscheduled future work — no phase in the 18-phase roadmap currently owns it. Flagged here so it isn't lost, not because Phase 17 was supposed to build it.

## Phase 16 (Testing) — resolved 2026-08-11; 6/7 acceptance criteria met

Real coverage gates (backend 90.74%/85% target, desktop 83.3%/80% target, agent tools 93.5%/90% target) and 8 real Playwright-Electron E2E specs (17 test cases, 15 passing) — see `CHANGELOG.md`/`PROGRESS.md`. What's left:

- [ ] A real Windows/macOS E2E CI matrix run — needs an actual push to the remote plus real CI minutes on non-Linux runners, same category as every other "first real CI run" gap already tracked (Phase 15's workflows, etc.).
- [ ] `auto-update.spec.ts` verifies the real dev-mode no-op path (`installAutoUpdater()`'s documented behavior when `!app.isPackaged`) but not a full mocked-update-server "update available → download → restart prompt" cycle — electron-vite bundles the whole main process into one `out/main/index.js`, so there's no separate `auto-updater.js` module this harness can `require()` in isolation to drive that cycle directly. Would need either a packaged build + a real mock update-feed HTTP server, or restructuring the main-process build to keep `auto-updater.ts` separately reachable.
- [ ] `chat.spec.ts`/`agent.spec.ts` verify their panels are real and reachable (and skip cleanly without a backend) but don't drive a full send-message/approve-a-step round trip — needs a seeded test account (register/login flow) and a reachable Ollama model, neither of which this harness or CI currently provisions. Next step once a seeded-test-account fixture exists.
- [x] **Resolved, found already built 2026-08-13:** LSP completion/code-action providers are real — see the dedicated entry above. `search-and-navigation.spec.ts`'s own E2E coverage is still limited to hover/definition (an E2E-suite gap, not a missing feature) — worth a follow-up E2E case if this suite is revisited.
- [ ] `readTerminalText()`/`window.__rasikTerminals` and `window.__rasikTestStore` are real, permanent additions to the shipped renderer bundle (not stripped in production builds) — a deliberate choice (see `CHANGELOG.md`'s reasoning about `contextIsolation`/CSP already being the real trust boundary), not an oversight, but worth knowing if a future security review wants to gate them behind a build flag instead.

## Housekeeping

- [ ] `docs/reports/2026-08-03-repository-structure-audit.md` proposes moving 21 root docs into `docs/architecture/` — a decision for the user, not yet acted on. If approved, follow the migration plan in that report (it's the largest single step: ~60–100 cross-reference updates).
- [x] `LICENSE` file — resolved 2026-08-11: user chose Apache 2.0. `LICENSE` (full Apache-2.0 text) added at repo root, `package.json`'s `license` field changed from `UNLICENSED` to `Apache-2.0`, `apps/backend/pyproject.toml` gained `license = "Apache-2.0"`.
- [x] Docs reorg (`docs/reports/2026-08-03-repository-structure-audit.md`'s proposal to move 21 root docs into `docs/architecture/`) — user declined for now (2026-08-11): "leave at root, revisit later." Not acted on; still a real, actionable proposal if priorities change.
- [ ] **All work across every session (Phases 3–11) remains uncommitted in git** — only 2 commits exist in history (initial monorepo bootstrap). Worth committing in logical, phase-sized chunks rather than one enormous diff; the user commits, per `CLAUDE.md`'s Development Rules.
