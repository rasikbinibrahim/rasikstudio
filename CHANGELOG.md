# Changelog

All notable changes to Rasik Studio are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has not yet made a versioned release — everything below is `[Unreleased]`.

## [Unreleased]

### Added — searchable model picker for Chat and Agent panels (2026-08-14)

Direct design request, with two reference screenshots of a comparable tool's model-selection UI
(search field, checkmark on the current selection, a tag on models the user can't use yet, a
"manage models" footer action). Adapted rather than copied: the reference is a subscription-tier
product and tags locked models "Upgrade" — Rasik Studio has no subscription tiers, so models are
unavailable because no API key is configured or no Ollama model has been pulled yet, not because
of a paid plan. Retagged as "Not configured" instead, and left out the reference's permissions
footer bar and mic button, since neither has a real feature behind it yet (`CLAUDE.md`'s
no-placeholder-implementation rule).

- **`components/ui/ModelPicker.tsx`** — new shared primitive (Radix `dropdown-menu`, same family
  as the existing `Dialog`/`ContextMenu`/`Tooltip`): a searchable list of models, sorted
  available-first, with a checkmark on the current selection, a "Not configured" tag on models
  the live `GET /api/v1/models` availability check reports as unreachable, and a "Manage
  Models…" item wired to the real `openSettings()` action (not a new one). New dependency:
  `@radix-ui/react-dropdown-menu`.
- **`features/chat/ChatSessionList.tsx`** and **`features/agent/AgentTaskList.tsx`** — both
  swapped their raw `<select>` model dropdown for `ModelPicker`, and both gained a small header
  toolbar (refresh — calls the real `loadChatSessions()`/`loadAgentTasks()`, and a filter toggle
  that live-filters the visible session/task list by title/description — both real, not
  decorative icons).
- 22 new tests (7 `ModelPicker.test.tsx`; `ChatSessionList.test.tsx` and `AgentTaskList.test.tsx`
  both rewritten for the dropdown interaction plus new refresh/filter coverage). Full desktop
  suite re-verified: 685 passed/1 failed (686 total) — the 1 failure is the already-documented
  `lsp-manager.test.ts` real-`typescript-language-server`-process flake (`TASKS.md`'s "Third
  known flaky category"), reproduced in isolation before crediting it as pre-existing, not caused
  by this change. `tsc --noEmit` and `eslint` both clean on every touched file.
- Not phase work — Phase 10's own acceptance criteria predate this component, so no phase's own
  Progress % or the weighted-overall number moves; this is backlog UI polish, same convention as
  the 2026-08-12/13 sessions' desktop-UI entries.

### Docs — re-verification and tracking corrections (2026-08-14)

Direct request to check `PROGRESS.md` against the real repository and push toward 100%. No
application code changed — re-verification plus three small, genuine tracking-drift fixes, the
same "code already done, tracking never caught up" pattern this project has hit before.

- Re-ran both suites for real: backend 474 passed/1 failed/3 skipped (91.90% coverage; the 1
  failure passes in isolation, a full-suite-load flake); `mypy`/`ruff` both zero-error; desktop 670
  passed/4 failed (674 total; the 4 failures are exactly the already-documented "Third known flaky
  category" in `TASKS.md` — real Monaco/LSP-process construction races under full-suite load, clean
  in isolation).
- Confirmed the uncommitted LSP client work (`app/infrastructure/lsp/`, `agents/tools/lsp_tools.py`,
  their tests) matches the 2026-08-13 part-8 entry's claims exactly, file-and-line.
- Fixed part 8's own test-count breakdown: `test_client.py` has 8 unit protocol-framing tests, not
  5 (the total of 20 new tests was already correct — only the internal split was wrong).
- `TASKS.md`'s Phase 3 section credited all 9 of 9 design-system primitives with real test coverage
  — `Input`/`Tooltip`/`Dialog`/`ScrollArea`/`Badge`/`ContextMenu` already had real, already-committed
  test files that a stale "6 of 9 missing" line never caught up to.
- `TASKS.md`'s closing "only 2 commits exist in history" line corrected — `git log` now shows 6.
- None of these are formal phase acceptance criteria, so the weighted-overall progress number is
  unchanged (~93%). See `PROGRESS.md`'s new 2026-08-14 session-update entry for the full writeup of
  what was and wasn't found.

### Added — Backend-side LSP client, real `get_diagnostics` agent tool (2026-08-13, part 8)

Closes Phase 8's last originally-unmet acceptance criterion (the other, SSRF prevention, closed in
an earlier session — see the Phase 8 entry in `PROGRESS.md`). Chosen as the first of the closable
feature gaps named in part 7's report because it's the smaller, more concretely-scoped of the two
real gaps (vs. a whole plugin runtime or memory-extraction subsystem).

- **`app/infrastructure/lsp/client.py`** — `LspClient`, a real, minimal LSP client: Content-Length-
  framed JSON-RPC over a spawned language server's stdio, no third-party LSP client library, the
  same "own the subprocess, no shell interpolation" convention `GitService`/`DockerService` already
  established. Handles `initialize`/`initialized`, `textDocument/didOpen`, and consuming
  `textDocument/publishDiagnostics` notifications — deliberately not a general-purpose client (no
  completion/hover/definition; that's the desktop's own `lsp-client.ts`'s job).
- **`app/infrastructure/lsp/manager.py`** — `LspClientManager`, one `pylsp` process per workspace,
  lazy-started on the first `get_diagnostics()` call, closed after 15 minutes of inactivity — the
  same shape as `PlaywrightBrowserService`, including a constructor-injectable idle timeout so the
  real close-after-idle behavior is test-verified in ~2 real seconds, not left untested the way the
  WebSocket gateway's original 30s timeout was in an earlier phase.
- **`app/agents/tools/lsp_tools.py`** — `get_diagnostics` (Low risk, read-only), registered for
  `coder`/`debugger`/`reviewer` agents in `agent_factory.py`.
- **Deliberately Python-only.** The LSP client that already exists (Phase 3's `lsp-manager.ts`) is
  Electron/TypeScript-side and resolves TS/JSON servers from `apps/desktop/node_modules` — another
  app's npm dependencies in this monorepo, unreachable from the Python backend without either
  vendoring those servers as a new backend dependency or building a cross-app request/response
  bridge. `pylsp` needed neither: resolved the same way the desktop already does (a `pylsp` on
  PATH, or `uvx` as a fallback), and this backend already depends on `uv`/`uvx` for its own
  tooling.
- **Real environment finding, not assumed from documentation:** the bare `python-lsp-server` PyPI
  package installs *zero* diagnostic-producing plugins — pyflakes/pycodestyle/mccabe are optional
  extras, not base dependencies. Caught by testing against a real spawned process and reading its
  own `--log-file` output (every plugin failing with `No module named ...`), not by reading docs.
  Fixed by resolving `python-lsp-server[flake8]` in the `uvx` fallback path instead of the bare
  package.
- **Verified against a real, unmocked `pylsp`, not a mock at any layer:** a real unused-import
  warning, a real undefined-name error, and a real pycodestyle spacing warning all came back
  correctly for a genuinely broken test file; a clean file correctly reported zero diagnostics;
  two files in the same workspace correctly reused one `pylsp` process rather than spawning a
  second.
- 20 new backend tests (8 unit `LspClient` protocol-framing tests against a fake stdio feed —
  write-framing, response/error dispatch, a truncated stream ending cleanly, a timeout when
  nothing ever publishes; 7 unit `get_diagnostics` tool tests against a mocked manager; 5 real
  integration tests against a real spawned `pylsp`; corrected 2026-08-14, the unit count was
  originally miscounted as 5). Full backend suite re-verified: 475 passed/3 skipped, 91.88%
  coverage (up from 91.81%, gate 85%); `mypy app/` (147 files) and `ruff check app/ tests/` both
  zero-error.
- `AGENT_FRAMEWORK.md`'s "Available Tools" table and deferred-tools section, `apps/backend/app/
  agents/tools/README.md`'s file table, `TASKS.md`, and `PROGRESS.md`'s Phase 8 entry all updated
  to match. TypeScript/JSON diagnostics remain a real, separate, not-yet-started follow-up —
  honestly scoped out, not silently claimed.

Phase 8 moves from 87.5% to 100% in `PROGRESS.md`'s weighted-progress Methodology (both of its own
originally-unmet acceptance criteria are now closed), moving overall weighted progress 91% → 93%.

### Fixed — PROGRESS.md re-verification pass, tracking drift (2026-08-13, part 7)

Direct request to check `PROGRESS.md` against the real repository and push toward 100%. Re-ran
both test suites for real before touching anything (backend 455 passed/3 skipped at 91.81%
coverage; desktop 671 passed/3 failed — the 3 matching the already-documented
Monaco/DiffViewer/lsp-manager flaky-under-full-suite-load category exactly, confirmed by rerunning
`DiffViewer.test.tsx` in isolation: 5/5 pass) — both matched `PROGRESS.md`'s existing claims
exactly, so the pre-existing 88% figure was honestly tracked, not stale on its own numbers. Found
and closed two real, previously-uncredited gaps (code/tests already existed, tracking hadn't caught
up — the same pattern this project has hit repeatedly):

- Phase 7's WS idle-timeout cleanup already had a real, passing test
  (`live_server_short_idle_timeout` fixture, `WS_IDLE_TIMEOUT_SECONDS=1`, verifies real
  close-after-idle and ping-resets-the-timer behavior against a real running server in under a
  second) — `gateway.py` was also already reading the timeout from `settings.ws_idle_timeout_seconds`,
  not a hardcoded constant. `PROGRESS.md`/`TASKS.md` both still listed this as unverified.
- Phase 12's `DiffViewer.test.tsx` (5 tests, real unmocked Monaco diff editor) was built
  2026-08-12 as part of the `monaco-editor` Vitest-resolution fix, and `TASKS.md` already marked
  it `[x]` — but Phase 12's own `PROGRESS.md` entry was never updated to match, still listing "no
  dedicated test" as an open gap. Bumped Phase 12 from 8/10 to 9/10.

Also ran a real, full-corpus broken-link audit — a relative-link-resolution check (skipping
`http(s)://`/`mailto:` targets) across all 135 markdown files in the repository, not just the
previously-checked new/modified subset from the original Phase 17 session. Zero broken links
found, closing that criterion's last narrowly-scoped caveat.

Overall weighted progress recomputed: 88% → 91% (Phase 7 95%→97%, Phase 12 80%→90%; see
`PROGRESS.md`'s Methodology section). **Explicitly not pushed to 100%, and said so rather than
guessing:** the honest remaining ~9% is not small polish — it's a live GitHub/Google OAuth app, an
Apple Developer account for macOS notarization, paid cloud AI API keys, and a real
push-triggered CI run (external/business decisions per `CLAUDE.md`'s own autonomous-mode
exceptions, not technical gaps this session can close unilaterally), plus real, currently-
unscheduled feature work (a plugin runtime, post-session memory extraction needing a
`memory_classifier.py` that doesn't exist, and a backend-side LSP client to wire up the
`get_diagnostics` agent tool — the LSP client that exists today is Electron/desktop-side and
unreachable from the Python backend without new plumbing). No application code changed this pass —
pure re-verification plus documentation/tracking corrections. See `PROGRESS.md`'s new
2026-08-13 (part 7) session entry and `TASKS.md`'s two newly-`[x]` items for full detail.

### Fixed — Broken README, stale roadmap/status docs (2026-08-13)

- **`README.md` had literal unresolved git merge-conflict markers** (`<<<<<<< HEAD`
  / `=======` / `>>>>>>> 06f46d3...`) left in from an earlier merge, plus a stray `# rasikstudio`
  stub and a "Pre-development, no implementation yet" status line — all real defects in the
  repository's front door, not stylistic nits. Fixed: conflict markers removed, a real "Running
  it" section added pointing to `CONTRIBUTING.md`'s already-accurate, verified setup instructions,
  and the Status section rewritten to reflect the real ~88%-complete state.
- **`docs/roadmap/README.md`'s Phase Summary Table showed all 18 phases as "NOT STARTED"** and its
  header said "Pre-development" — both untouched since 2026-08-03, before any of the 18 phases'
  real implementation work happened. Re-synced from `PROGRESS.md` (the actual authoritative
  tracker) with each phase's real status, and the table now explicitly says `PROGRESS.md` wins on
  any future conflict, so this specific drift doesn't recur silently.
- **`DEPLOYMENT_GUIDE.md`'s "One-command setup" showed a raw `alembic upgrade head`** and an
  unconditional `.env` copy step — both stale relative to ADR 0009 (the real, advisory-lock-
  protected migration command, `apps/backend/scripts/check_migration_lock.py`, run via `make dev`)
  and `CONTRIBUTING.md`'s own verified finding that local dev needs no `.env` file at all. Fixed
  to match `CONTRIBUTING.md`.
- `PROJECT_MASTER_SPEC.md`'s status line bumped from the stale ~86%/2026-08-11 snapshot to the
  current ~88%/2026-08-13 one.

### Fixed — "No display server" was never actually true (2026-08-13)

- **First real, visual GUI verification in this project's history.** Every prior session assumed
  this environment has no display server without checking — `DISPLAY=:0` (WSLg) responds for
  real. Electron itself was missing 3 shared libraries (`libnspr4`/`libnss3`/`libasound2`) —
  worked around without root the same way Phase 13 solved the identical problem for Playwright's
  bundled Chromium (`apt-get download` the `.deb`s, `dpkg-deb -x` into a local prefix,
  `LD_LIBRARY_PATH` pointed at it). A real `pnpm build` + Playwright's `_electron.launch()` (the
  same launch mechanism the E2E suite already uses) against the real packaged `out/main/index.js`
  rendered correctly and was screenshotted: the IDE shell, a real folder opened end-to-end, Monaco
  with real syntax highlighting, the command palette's real fuzzy list, the embedded terminal with
  a real live shell prompt, and the Git panel with a real detected change. Also confirmed the
  terminal's WebGL2 rendering context is genuinely active (`canvas.getContext('webgl2')` returns
  non-null on the addon's own canvas), closing Phase 11's long-open "confirm WebGL activates"
  acceptance criterion for real. No application code changed — pure verification. See
  `PROGRESS.md`'s Phase 3 Notes for the full reproducible method and `TASKS.md`'s newly-resolved
  items for exactly what this unblocks (and what's still genuinely unexercised: Docker/Chat/Agent/
  Browser panels, branch switching, a real merge conflict walkthrough).

### Added — Drag-and-drop file attach in chat (2026-08-13)

- **Dragging a file from the tree into the chat input now attaches it as context** — previously
  the only way to attach a file was the "attach the file I'm currently looking at" toggle, which
  can't attach anything other than the currently-open editor tab. `FileTreeNode.tsx`'s file rows
  (not directories) are now `draggable`, setting a workspace-relative path via a new shared
  `application/x-rasik-file-path` custom MIME type (`lib/file-drag-mime.ts`, so the drag and drop
  sides can't drift on the literal string). `ChatInput.tsx` accepts the drop, reads the file's
  real content, and shows it as a removable attachment chip — taking priority over the
  pre-existing active-file toggle if both happen to be set. No backend change needed;
  `SendMessageRequestSchema.active_file` already accepted either shape. 6 new tests (2
  `FileTreeNode.test.tsx`, 4 `ChatInput.test.tsx`).

### Added — Desktop UI to pull/manage Ollama models (2026-08-13)

- **A user no longer needs the `ollama` CLI just to get this app's local-model features
  working.** `docs/reference/ollama/ANALYSIS.md` §8 flagged the total absence of any model-
  management UI as a real, un-tracked gap. New `app/infrastructure/ai/ollama_registry.py`
  (`OllamaRegistry` — deliberately separate from `OllamaProvider`, which implements the
  `AIProvider` port for *using* an installed model, not managing the install; same constructor-
  injectable `httpx.AsyncClient` testability pattern) backs 3 new endpoints:
  `GET /api/v1/models/ollama/installed`, `POST /api/v1/models/ollama/pull`,
  `DELETE /api/v1/models/ollama/{name}`. `POST /pull` is a direct HTTP streaming (NDJSON)
  response — a deliberate departure from this app's usual WebSocket-event pattern
  (`index_progress` etc.), since a model pull has no natural workspace to scope a
  `ws:workspace:{id}:...` channel to; Ollama is one shared local server, not a per-workspace
  resource. Desktop: `services/ollama-client.ts` consumes the stream with a real `ReadableStream`
  reader (flushing a trailing partial line, not dropping it), and a new
  `OllamaModelsSection.tsx` in the Settings panel shows installed models with their real disk
  size, live per-line pull progress, and a Remove button per model. 34 new tests (8 backend unit
  against `httpx.MockTransport`, 13 backend integration covering auth + a real `503` when Ollama
  is unreachable — this environment has no real Ollama server, same category as Phase 9's
  live-cloud-API gaps — 6 desktop `ollama-client.test.ts`, 7 desktop
  `OllamaModelsSection.test.tsx`). Full backend suite: 455 passed/3 skipped (91.81% coverage,
  gate 85%); mypy/ruff clean. `docs/api/REST_REFERENCE.md` and
  `docs/reference/ollama/ANALYSIS.md` updated to match.

### Added — `ask_followup_question` agent tool (2026-08-13)

- **Agents can now pause mid-task to ask an open-ended clarifying question**, not just fall back
  to a best-effort guess or fail a guard rail — Cline's `ask_followup_question` equivalent
  (`docs/reference/cline/TOOL_DESIGN_NOTES.md`, a real gap this project's own reference-repository
  analysis surfaced 2026-08-12). New `app/agents/tools/interaction_tools.py`, registered for every
  agent type (orchestrator, coder, tester, debugger, doc-writer, researcher, reviewer). Reuses
  `agents/running_tasks.py`'s existing one-shot Redis `BLPOP` hand-off shape rather than inventing
  a second mechanism (`wait_for_answer`/`submit_answer`, symmetric with the approval gate's
  `wait_for_approval`/`resolve_approval`); `request_cancel` now unblocks whichever of the two a
  task happens to be waiting on. New `agent_question_asked` WebSocket event and
  `POST /api/v1/agents/tasks/{id}/answer` (`AnswerAgentQuestionUseCase`). `BaseAgent.run()` wraps
  the call with the same `paused`/`running` DB status transition the HIGH-risk approval gate
  already gets, triggered by tool name instead of risk level. Desktop:
  `AgentQuestionPrompt.tsx` (mirrors `AgentApprovalPrompt.tsx` — free-text input instead of
  approve/deny), wired into `AgentStepTimeline.tsx`, `agent-slice.ts`, and `useAiEventBridge.ts`.
  8 new backend tests, 20 new desktop tests. Full backend suite: 441 passed/3 skipped (91.86%
  coverage, gate 85%); mypy/ruff clean. See `AGENT_FRAMEWORK.md` §4's new writeup,
  `BACKEND_ARCHITECTURE.md` §6's event table, and `docs/api/REST_REFERENCE.md`, all updated to
  match.

### Added — Auto-trigger RAG indexing on workspace open (2026-08-13)

- **Workspace indexing now starts automatically instead of requiring a manual click.**
  `TASKS.md`'s "no trigger besides the explicit `POST /workspaces/{id}/index` call" gap meant
  `code_embeddings` stayed empty (and chat's RAG context silently unavailable) until a signed-in
  user found and clicked the `FileExplorer` "Index" button by hand — the button itself was only
  added 2026-08-12 and nothing called it automatically. `workspace-slice.ts`'s `openFolder()`
  (and `openFolderAtPath()`, which shares the same `applyWorkspaceRoot()` helper) now calls
  `startIndexing()` immediately after a workspace successfully backend-syncs and its WebSocket
  connects — fire-and-forget, using `startIndexing()`'s own existing error handling
  (`indexingStatus: 'error'`), so a failed index run can never block folder-open. `auth-slice.ts`'s
  `setSession()` gained the identical trigger on its own backend-sync path (signing in *after* a
  folder is already open — documented in that function's own comment as the more common real
  ordering), since it duplicates `openFolder()`'s sync logic and would otherwise leave that
  ordering with the same silent gap. The manual "Index" button in `FileExplorer.tsx` is unchanged
  and still useful for re-indexing after files change, since no file-watcher-triggered incremental
  re-index exists yet (`TASKS.md`'s separate, still-open `chokidar`-equivalent gap). 4 new tests
  (`store/workspace-slice.test.ts`, new file — the sync+connect flow in `applyWorkspaceRoot()` had
  no dedicated unit test file before this).

### Added — Live model catalog, git-diff chat context, streaming token usage, RAG file-level pre-check (2026-08-12)

- **Live model selector.** `ChatSessionList.tsx`/`AgentTaskList.tsx` used a hardcoded model
  shortlist (`FALLBACK_MODELS`, formerly `DEFAULT_MODELS`) — explicitly called out as deferred in
  this same file's Phase 10 entry above. Both now call the real `GET /api/v1/models` on mount
  (new `services/models-client.ts`, `store/models-slice.ts`) and render the live catalog, with
  unavailable models labeled and the hardcoded list kept only as a fallback if the fetch fails or
  no session token exists yet. 9 new tests.
- **Git-diff chat context source.** Chat could already attach the active file as context; it had
  no way to show the model *uncommitted changes*. New `infrastructure/git/diff.py`
  (`get_working_tree_diff()`, real `git diff` subprocess, capped at 20k chars, degrades silently
  to `""` on any failure) feeds a new `## Uncommitted changes (git diff)` block into
  `context_builder.build_chat_context()` when `SendMessageRequest.include_git_diff` is set.
  Deliberately a separate code path from the agent's own `git_diff` tool
  (`agents/tools/git_tools.py`), which needs to distinguish "git failed" from "no changes" as
  different agent-observable outcomes — this context source always degrades silently instead.
  Desktop: `ChatInput.tsx` gained an "Uncommitted changes" toggle next to the existing active-file
  one. 10 new tests, including a real end-to-end integration test against a real temp git repo.
- **Streaming chat replies now record real token usage.** `StreamChunk` carries no usage field
  (called out as a known gap in this file's Phase 10 entry), so `send_message.py` now calls the
  new `ModelRouter.count_tokens()` passthrough once the stream completes — on the full assembled
  reply for `completion_tokens`, and on the built context for `prompt_tokens`. Persisted on the
  `messages` row (`token_count`) and surfaced in `StreamEndEvent.usage` and `MessageSchema`. 5 new
  tests.
- **RAG indexer file-level `(mtime, size)` pre-check.** `PERFORMANCE_GUIDE.md` §1's original ask,
  tracked in `TASKS.md`'s Celery-infrastructure follow-up list since 2026-08-11: a full re-index
  re-read and re-chunked every file on disk even when only its per-chunk content hash ultimately
  decided nothing needed re-embedding. New `indexed_files` table (`IndexedFileModel`, migration
  `0004`) caches each file's `(mtime, size_bytes)` per workspace; `index_workspace()` now checks a
  fresh `os.stat()` against it *before* reading a file at all, skipping the read+chunk step
  entirely for anything unchanged (`IndexResult.files_skipped_unchanged` makes the skip count
  observable). Stale-file cleanup now also clears the cache row, not just `code_embeddings`, so a
  file re-created later at an identical path/mtime/size is never wrongly treated as still indexed.
  Stat-based by design, not content-hash-based: an mtime bump with byte-identical content still
  forces a re-read, a documented and tested tradeoff, not a bug. 5 new integration tests against
  real Postgres/Redis/filesystem.
- Investigated and closed the `httpx2` `StarletteDeprecationWarning` seen on every backend test
  run — `httpx2` is a real, separately-published PyPI package Starlette's `testclient.py` now
  prefers over plain `httpx`. Added as a dev dependency (`uv add --dev httpx2`); warning confirmed
  gone.

### Fixed — Agent cancellation propagation, and the real `monaco-editor` Vitest blocker (2026-08-12)

- **Agent task cancellation didn't reach sub-agents.** `POST /api/v1/agents/{id}/cancel` on an
  orchestrator task never stopped an in-flight sub-agent it had delegated to via `create_agent` —
  `agent_factory.run_sub_agent()` gives every sub-agent its own `sub_task_id`, genuinely distinct
  from the parent's own `task_id`, and cancellation was keyed per-task-id. Fixed:
  `AgentContext` gained `cancellation_chain: tuple[UUID, ...]` (every ancestor, nearest first),
  threaded down through `execute_agent_task()`/`run_sub_agent()`; `BaseAgent._check_cancelled()`
  now heartbeats *and* checks every ancestor's Redis keys, not just its own — heartbeating
  ancestors was necessary, not optional, since a long-running sub-agent would otherwise let its
  ancestor's own heartbeat expire while blocked waiting on it, making a genuinely-running parent
  task look inactive to the cancel endpoint. Works through arbitrarily nested delegation. Found
  while writing `docs/reference/openhands/MULTI_AGENT_NOTES.md` and verified against the real
  code before fixing. 4 new tests.
- **The real root cause of `monaco-editor`'s Vitest resolution failure, fixed for good** — not
  worked around per-component. `monaco-editor`'s `package.json` ships only a `"module"` field (no
  `"main"`/`"exports"`), and Vite's SSR-style module resolution (what Vitest's transform pipeline
  uses even for jsdom tests) defaults `resolve.mainFields` to `['main']` only — the actual reason
  `import('monaco-editor')` always failed. Fixed with one line
  (`vitest.config.ts`'s `resolve.mainFields: ['browser', 'module', 'main']`), then 5 further real,
  narrow jsdom gaps closed in `src/test/setup.ts` (a `document.queryCommandSupported` stub, a
  minimal fake canvas 2D context with a proper `canvas` back-reference, `navigator.clipboard` +
  `ClipboardItem` stubs, and a targeted `unhandledRejection` filter for Monaco's own internal
  diff-computation cancellation signal) — each hit and fixed in sequence by actually mounting a
  real editor, not guessed in advance. Real, unmocked `monaco-editor` now fully works under
  Vitest: editor creation, model create/reuse/dispose, view-state save/restore, and the diff
  editor all verified. Closed two long-standing coverage gaps this unblocked:
  **`MonacoEditor.test.tsx`** (new, 5 tests) and **`DiffViewer.test.tsx`** (new, 5 tests, real
  diff computation against `git show`/`files.read`-sourced content). See `TASKS.md`'s own
  dedicated entry for the full technical writeup. Desktop suite: 590 tests (up from 579), 86.8%
  coverage (up from 82.04%). One real regression caught before shipping: the `navigator.clipboard`
  stub's first draft was non-writable, breaking `FileTreeNode.test.tsx`'s own pre-existing
  clipboard override — fixed with `writable: true`.

### Added — Agent approval denial reason, and in-terminal search (2026-08-12)

- **Approval denials can now carry a reason.** `POST /api/v1/agents/{id}/approve` gained an
  optional `reason: str | null`, threaded through `ApproveAgentStepRequest` →
  `RunningTaskRegistry.resolve_approval()` (the Redis approval hand-off is now a JSON-encoded
  `ApprovalDecision`, not a bare string) → `BaseAgent._await_approval()`, which folds it into the
  denied tool call's own observation ("Action denied by user: wrong file, try b.txt instead") so
  the agent can plan around *why* it was refused, not just that it was. Desktop:
  `AgentApprovalPrompt.tsx` gained an optional reason input next to Approve/Deny. Surfaced by
  `docs/reference/cline/APPROVAL_GATE_NOTES.md`'s comparison against Cline's own rejection flow.
  8 new tests.
- **Terminal `SearchAddon` — loaded since Phase 11, never reachable from any UI until now.**
  `useTerminal.ts` now stores the addon instance and exposes real `findNext`/`findPrevious`;
  `TerminalTab.tsx` gained a find bar (`Ctrl`/`Cmd`+`F` while a terminal is focused, `Enter`/
  `Shift+Enter` for next/previous, `Escape` or a close button to dismiss). Surfaced by
  `docs/reference/xterm/ADDON_NOTES.md`'s comparison. 11 new tests, including 3 against a real
  xterm.js buffer with real written content (not mocked).

### Added — Phase 1 reference-repository analysis, all 9 (2026-08-12)

- **`docs/reference/{vscodium,cline,openhands,continue,ollama,monaco,playwright,xterm,libgit2}/`**
  — `CLAUDE.md`'s own "For every reference repository, analyze and document" requirement, closing
  Phase 1's last open formal deliverable after 17 other phases' worth of implementation had
  already happened. 37 new files (~21,400 words): one `ANALYSIS.md` per project covering all 11
  required dimensions (architecture, folder structure, design patterns, dependencies, build
  process, features, strengths, weaknesses, reusable modules, modules to rewrite, license
  requirements), plus each folder's own README-specified supplementary notes files
  (`ARCHITECTURE_NOTES.md`, `TOOL_DESIGN_NOTES.md`, `APPROVAL_GATE_NOTES.md`, `SANDBOX_NOTES.md`,
  `MULTI_AGENT_NOTES.md`, `CONTEXT_BUILDING_NOTES.md`, `COMPLETION_NOTES.md`, `API_NOTES.md`,
  `TOKENIZER_NOTES.md`, `ELECTRON_SETUP_NOTES.md`, `LSP_INTEGRATION_NOTES.md`, `THEMING_NOTES.md`,
  `SESSION_LIFECYCLE_NOTES.md`, `SCREENSHOT_NOTES.md`, `WEBGL_SETUP_NOTES.md`, `ADDON_NOTES.md`,
  `PTY_INTEGRATION_NOTES.md`, `CLI_VS_NATIVE_NOTES.md`) and a `LICENSE_NOTES.md` per project.
  Written after most of this project's own implementation, not before — every comparison cites the
  real, already-shipped code it references (file paths, line numbers), making the analysis
  verifiable against the current repository rather than generic architecture-essay prose.
- **libgit2's license corrected**: this folder's own prior README said "LGPL" — the precise term
  is GPLv2 with a Linking Exception (functionally similar for a consumer, not textually the same
  license). Fixed in the new `LICENSE_NOTES.md` and the parent `docs/reference/README.md`'s
  summary table.
- **A real, previously-undiscovered gap found and verified while writing the OpenHands
  comparison**: cancelling a parent orchestrator agent task doesn't propagate to an in-flight
  sub-agent it spawned via `create_agent` — `agent_factory.run_sub_agent()` gives every sub-agent
  its own `sub_task_id = uuid4()`, genuinely distinct from the parent's own `task_id`, so
  `CancelAgentTaskUseCase`'s per-task-id Redis cancel key can never reach it. Confirmed by reading
  the real code, not just inferred from the comparison. New `TASKS.md` item under Phase 8. Five
  smaller gaps also surfaced and recorded (`TASKS.md`'s new "Discovered during the 2026-08-12
  reference-repository analysis" section): no agent equivalent of Cline's mid-task clarifying
  question, no step-level undo for agent file edits, no "why" field on approval denial, no
  git-diff context source for chat, no desktop UI to manage Ollama models, and xterm.js's
  `SearchAddon` being loaded but unreachable from any UI.
- **Phase 1's stale "Remaining Tasks" list re-verified against the repository, not assumed**: 10
  formal ADRs (Phase 17), `packages/desktop-types/` (Phase 17), and the GitHub Actions CI skeleton
  (Phase 15) were all already real and just never reconciled back into Phase 1's own entry.
  `.env.example` (desktop) was investigated rather than credited or left open — found genuinely
  not applicable, since the desktop app has no build-time env-var configuration surface at all
  (the backend URL is a runtime, user-editable Settings field, not an env var).
- Phase 1 moved from `PROGRESS.md`'s `# In Progress` (20%) to `# Completed` (100%); overall
  weighted progress ~86% → ~88%.

### Fixed — Security and correctness hardening (2026-08-12)

- **OAuth CSRF `state` was generated but never verified.** `build_authorize_url` always minted a
  `state` nonce, but nothing stored or checked it — a forged `/callback` request (an attacker's
  own authorization code paired with a guessed/replayed `state`) could have linked an
  attacker-controlled provider account to a victim's session. Fixed:
  `store_oauth_state`/`consume_oauth_state` (`application/auth/oauth.py`) stash the nonce in
  Redis (10-minute TTL) on `/auth/oauth/{provider}` and verify+consume it (single-use) on
  `/callback`, which now requires a `state` query param and fails `401 auth_error` before any
  token exchange if it's missing, unrecognized, or already used. `API_SPECIFICATION.md`/
  `AUTHENTICATION.md`/`docs/api/AUTHENTICATION.md` updated to match. 4 new tests.
- **`GeminiProvider` sent the wrong function name on every multi-turn tool call.**
  `_to_content()` used a `role="tool"` message's `tool_call_id` (an opaque uuid,
  `GeminiProvider._extract_tool_calls`'s own `str(uuid4())`) directly as the function *name*
  Gemini's `function_response` part requires — any agent task actually routed to a Gemini model
  with more than one tool round-trip would have sent Gemini a nonsensical function name instead of
  e.g. `read_file`. Fixed: `_split_system()` now builds an id→name map from every `ToolCall` in
  the conversation's own prior `assistant` messages (always present — `base_agent.py`'s ReAct loop
  appends the `assistant` message with real tool-call names immediately before the matching
  `role="tool"` message) and `_to_content()` resolves the real name from it, falling back to the
  raw id only for an orphaned/unmatched call. 2 new tests.
- **`POST /workspaces` (find-or-create) was racy under concurrent requests.** Two concurrent
  requests for the same `(user_id, root_path)` could both pass the app-layer
  lookup-before-insert and both attempt to insert — the only thing preventing a duplicate
  workspace row was ordering luck. Fixed with a real DB constraint,
  `uq_workspaces_user_root_path` (migration `0003_acb1d745f812`); `CreateWorkspaceUseCase` now
  catches the `IntegrityError` a lost race raises, rolls back (`WorkspaceRepository.rollback()`,
  new port method), and recovers by reusing the winning request's row — the same outcome a normal
  cache-hit produces, not a 500. The same migration also fixes `idx_workspaces_last_opened` to
  sort `last_opened_at DESC`, matching `DATABASE_DESIGN.md` (previously ascending — SQLAlchemy's
  declarative `Index()` needs the mapped column's own `InstrumentedAttribute` for per-column sort
  order, so this had to move out of `__table_args__` to after the class body). Verified against
  real Postgres (up/down/up clean); 5 new unit tests.

### Added — Desktop RAG indexing UI + Docker remove action (2026-08-12)

- **Desktop UI to trigger workspace RAG indexing and show progress** — the backend's
  `POST /workspaces/{id}/index` pipeline (real since 2026-08-11) had no caller anywhere in
  `apps/desktop/src/`, so `code_embeddings` stayed empty on every real workspace and chat's RAG
  context had nothing to find unless someone called the endpoint directly. Fixed:
  `services/indexing-client.ts`, `workspace-slice.ts` gained `indexingStatus`/`indexingProgress`/
  `startIndexing()`/`handleIndexProgress()` (reset on every new folder open), wired to the real
  `index_progress` WebSocket event via `useAiEventBridge.ts`. UI is an "Index" button + inline
  file-count progress in `FileExplorer.tsx`'s header, shown once signed in and synced
  (`backendWorkspaceId` set) — not a new dedicated panel, since indexing is workspace-wide infra.
  14 new tests.
- **`docker rm`/remove action** — `DockerPanel`'s feature set previously stopped at
  list/start/stop/restart/logs/shell. Added `DockerService.remove()` (`docker rm -f`, works on a
  running container too), the `docker:remove` IPC handler + preload bridge, `removeContainer()` in
  `docker-slice.ts` (deselects and stops any active log stream first if the removed container was
  selected), and a Remove button per `ContainerItem` gated behind a `Dialog` confirmation — the
  same destructive-action pattern `FileTreeNode.tsx`'s delete confirmation already established.
  7 new tests, including a real-Docker verification (not mocked) that `remove()` actually deletes
  a running container.

### Added — Workspace RAG indexing pipeline (2026-08-11, same day as the Celery infrastructure below)

- **`app/domain/services/chunker.py`** — pure, framework-free chunking logic: fixed-size token
  chunking with overlap (`chunk_text()`, `tiktoken`'s `cl100k_base`, 512 tokens/64 overlap per
  RAG_SYSTEM.md §3.3's documented fallback strategy — the tree-sitter AST-aware alternative that
  doc also describes is not built, a real tracked follow-up in `TASKS.md`, not silently dropped),
  extension/language classification, and the shared `EXCLUDED_DIR_NAMES` set now also imported by
  `agents/tools/search_tools.py` (previously its own private, independently-tuned copy).
  `start_line`/`end_line` for each chunk are derived from the chunk's own decoded text (not
  computed independently), since token boundaries aren't line or character boundaries.
- **`app/infrastructure/rag/indexer.py`** — `index_workspace()`, the real orchestration: walks a
  workspace (`os.walk`, pruning excluded directories rather than filtering after descending into
  them), reads and chunks every indexable file (truncating anything over 500KB to its first 10K
  characters per RAG_SYSTEM.md §3.2, skipping — not crashing on — files whose extension lied about
  being real UTF-8 text), and embeds only the chunks whose SHA-256 content hash actually changed
  since the last run (a real per-chunk dedup check *before* calling the embedding provider, not
  just the existing `EmbeddingRepository.upsert()`'s database-level `WHERE content_hash != ...`
  safety net, which only helps after the — real, rate-limited, billed for cloud providers —
  embedding call has already happened). Reconciles deletions both ways: a file that shrank has its
  now-stale tail chunks pruned (`EmbeddingRepository.delete_chunks_from_index`); a file removed
  from disk entirely has all its chunks removed (`delete_for_file`). Publishes real
  `index_progress` WebSocket events (workspace-wide) as each file completes. Mirrors
  `agents/agent_factory.execute_agent_task()`'s self-contained structure (own DB session, own
  Redis client) for the same reason — runs inside a Celery worker, not a FastAPI request.
- **`app/tasks/indexing_tasks.py`** — `index_workspace_task`, the Celery entrypoint
  `IndexWorkspaceUseCase` dispatches to via `.delay()`. Same `asyncio.run()` + engine-dispose
  pattern as `agent_tasks.py`, same reasoning, verified the same way: a new
  `tests/integration/rag/test_indexing_tasks.py` calls the real task function twice in a row via
  `asyncio.to_thread` and confirms both succeed.
- **`POST /workspaces/{id}/index`** — real now, not deferred. `IndexWorkspaceUseCase` verifies
  ownership, then dispatches; returns `202 Accepted` immediately, same "queue and return" pattern
  as `RunAgentTaskUseCase`. `EmbeddingRepository` gained `get_content_hashes`,
  `delete_chunks_from_index`, `list_indexed_file_paths`, and `delete_for_file` — the queries the
  indexer needs that didn't exist yet.
- **Tests, all real**: 7 new `tests/unit/domain/test_chunker.py` cases (pure function tests,
  including a reassembly invariant proving zero-overlap chunks exactly tile the original content);
  12 new `tests/integration/rag/test_indexer.py` + `test_indexing_tasks.py` cases against real
  Postgres+Redis testcontainers and a scripted fake embedding provider — covering the excluded-
  directory filter, real WebSocket progress events, unchanged-content dedup (zero new `embed()`
  calls on a no-op re-index), partial re-embedding (only the changed file's new content gets
  embedded), deletion reconciliation, binary-content safety, size-cap truncation, and the
  empty-file edge case; 4 new `tests/integration/api/test_workspaces.py` cases for the HTTP layer
  (ownership check, 202 response, dispatch args, auth requirement). Full backend suite: 399 tests,
  91.18% coverage (gated 85%), mypy/ruff clean.
- **Docs**: RAG_SYSTEM.md gained an implementation-status note (what's real vs. still-illustrative
  in its own code samples, and every real deviation from what it originally specified);
  `apps/backend/app/application/workspaces/README.md`'s `index_workspace.py` row moved from
  "deliberately not built" to the CRUD table; `domain/services/README.md`'s file table corrected
  (three of its five originally-planned files were actually built in `infrastructure/`/
  `application/` instead, once their real I/O needs became clear — this directory's own "no I/O"
  rule ruled out the locations the table originally predicted); ADR 0004's Outcome extended;
  `agents/tools/search_tools.py`'s `search_semantic` docstring and
  `application/chat/context_builder.py`'s RAG-retrieval docstring both updated to stop describing
  indexing as unbuilt.

### Added — Real Celery infrastructure for agent task execution (ADR 0004) (2026-08-11)

- **`app/core/celery_app.py`** — the real `Celery` app ADR 0004 decided on but never stood up.
  Broker and result backend both point at Redis DB index 1 (`CELERY_BROKER_URL`/
  `CELERY_RESULT_BACKEND_URL`, new `Settings` fields) — a distinct keyspace from `REDIS_URL`'s
  cache/pub-sub usage, not new infrastructure. `--pool=threads`, not Celery's default prefork:
  prefork forks worker child processes *after* `app.infrastructure.db.session`'s module-level
  async engine has already been imported by the parent, and the child inherits the parent's
  asyncpg connections — a real, documented SQLAlchemy-async-engine-plus-`fork()` hazard. Threads
  avoid the fork entirely.
- **`app/tasks/agent_tasks.py`** — `run_agent_task`, the Celery entrypoint. Each call gets its own
  event loop via `asyncio.run()` and disposes the shared DB engine at the top of every call, since
  pooled asyncpg connections are bound to the event loop that opened them — without this, a second
  task running in the same worker thread would try to reuse a connection left over from the first
  task's now-closed loop and fail. Verified for real, not just reasoned about:
  `tests/integration/agents/test_agent_tasks.py` calls the real task function twice in a row (via
  `asyncio.to_thread`, the same execution model `--pool=threads` uses) and confirms the second call
  succeeds — before this fix was written into the test setup correctly, the same test reproduced
  the real `RuntimeError: ... attached to a different loop` this design avoids. Retries are
  disabled: re-running a partially-completed agent task isn't a safe replay of an idempotent job.
- **`RunAgentTaskUseCase.execute()`** now dispatches via `run_agent_task.delay()` instead of
  `app/core/background.py`'s `fire_and_forget()` — agent tasks now survive a backend/API-process
  restart, since the queued job lives in Redis rather than process memory.
- **`agents/running_tasks.py`'s `RunningTaskRegistry` rewritten Redis-backed** — the part of this
  change that turned out not to be small. It used to coordinate cancellation and human-approval
  hand-offs with plain in-process `asyncio.Event`/`asyncio.Future` objects, correct only because
  the agent task and the API request handling `cancel`/`approve` ran in the same process. Once the
  task moved to a separate Celery worker process, that stopped being true. Now: a
  `agent:heartbeat:{id}` key with a TTL (existence means "some worker is actively running this
  task"), an `agent:cancel:{id}` flag, and an `agent:approval:{id}` Redis list `BaseAgent` blocks
  on via `BLPOP` while paused. `BaseAgent.run()` no longer takes a `handle: RunningTask` parameter
  — cancellation/approval checks go through `running_tasks` directly, keyed by `AgentContext`'s own
  `task_id`/`redis` (a new field on `AgentContext`, the same client `EventEmitter` already used).
- **`docker-compose.yml`** gained a `worker` service (same image as `backend`, `celery -A
  app.core.celery_app worker --pool=threads --concurrency=4` as its command, its own
  `celery inspect ping`-based healthcheck since the image's default `/health/live` HTTP healthcheck
  doesn't apply to a container with no HTTP server). `Makefile` gained a `worker` target for native
  local dev, documented in `CONTRIBUTING.md` as a separate terminal alongside `make dev` — agent
  tasks queue regardless of whether a worker is running, but nothing processes them without one.
- **Real end-to-end verification, not just unit tests**: started the real worker process locally
  (`make worker`), confirmed it connected to Redis and registered `agent.run_task`, ran
  `celery inspect ping` against it successfully, and dispatched a real `.delay()`'d task that the
  worker picked up and executed (observed failing with the expected, correct error for a
  made-up task id that doesn't exist in the database — proving the full broker → worker →
  `execute_agent_task` → error-handling path is real, not mocked).
- **Deliberately not moved to Celery: chat message streaming** (`application/chat/send_message.py`)
  — still uses `fire_and_forget()`. ADR 0004's own Context section named two categories of work
  needing a broker/worker (agent task execution, workspace RAG indexing); chat streaming was never
  one of them, despite a later retrospective note conflating it in. It's a live, low-latency token
  stream tied to one specific WebSocket connection in the same backend deployment that received the
  request — routing it through a worker hop would add latency for no durability benefit a
  user-facing stream needs. See ADR 0004's updated Outcome for the full reasoning.
- **Tests**: `tests/unit/agents/conftest.py`'s `FakeRedis` extended from publish-only to also
  implement `exists`/`set`/`expire`/`delete`/`rpush`/`blpop` (the subset `RunningTaskRegistry`
  needs); `tests/unit/agents/test_base_agent.py`, `tests/unit/application/agents/test_approve_step.py`,
  `tests/unit/application/agents/test_cancel_task.py` updated for the new async, Redis-backed
  registry API; `tests/unit/application/agents/test_run_task.py` rewritten to verify Celery
  dispatch (a fake `.delay()`) instead of direct in-process execution; `tests/integration/agents/test_agent_execution.py`'s
  approval/cancel tests updated to pass a real Redis client; new
  `tests/integration/agents/test_agent_tasks.py` (3 tests, real Postgres+Redis via testcontainers)
  verifies the real task wrapper end-to-end, the cross-event-loop-reuse fix specifically, and the
  infrastructure-failure logging path. Full backend suite re-verified: 372 tests, 90.85% coverage
  (gated at 85%), mypy/ruff clean.
- **Docs**: ADR 0004's Outcome section rewritten to describe what's actually built (not
  "not implemented"); `AGENT_FRAMEWORK.md` §10's implementation note, `docs/adr/README.md`,
  `docs/api/REST_REFERENCE.md`, `apps/backend/app/application/agents/README.md` (which had an
  inverted claim — `RunAgentTaskUseCase.execute()` is called *by* the HTTP handler, not *by* the
  worker — predating this change, now corrected), and
  `apps/backend/app/application/workspaces/README.md` all brought back in sync.

### Fixed — File tree virtualization, same-day follow-up to the Phase 18 baseline (2026-08-11)

- `useFileTree.ts` gained a `flattenVisible()` helper and a `visibleEntries: {entry, depth}[]` array (a `useMemo` over `rootEntries`/`childrenByPath`/`expandedPaths`); `FileTree.tsx` was rewritten to render that flat array through `@tanstack/react-virtual` (the same pattern already proven in `ChatMessageList.tsx`); `FileTreeNode.tsx` no longer recurses into its own children — it renders exactly one row, with the context menu, rename/delete dialogs, drag-and-drop, and git-status decorations all preserved unchanged.
- **Real, re-measured result**: 1000 real files in a real temp workspace, measured the same way as the rest of the Phase 18 baseline (Playwright's `_electron.launch()` + real CDP metrics) — **1265ms → 356ms**. DOM inspection confirmed only ~45 real `[role="treeitem"]` nodes exist at any time regardless of file count, proving virtualization is actually active, not just wired up.
- **Tests**: 4 new `useFileTree.test.ts` cases test the flattening logic directly (flat root list, expanded-directory insertion at depth+1, collapsed directories omitted, nested depth-first ordering); 2 new `FileTree.test.tsx` cases test the virtualizer wiring via computed scroll-area height (jsdom has no real layout engine, so exact row visibility can't be asserted — same documented limitation `ChatMessageList.test.tsx` already established for the identical pattern). The old `FileTreeNode.test.tsx` test asserting recursive child rendering was removed as obsolete (that responsibility moved to `FileTree.tsx`) and replaced with an inline comment pointing to its replacement coverage.
- **Tradeoff, honestly measured, not glossed over**: the initial renderer bundle grew back from 695.59KB to 729.6KB, since `@tanstack/react-virtual` is now part of the eagerly-loaded `FileTree.tsx` chunk. Accepted deliberately — the render-cost miss this fixes was ~25x over its target; the bundle-size miss it reopens was already over target before this change.
- **Residual, unaddressed gap**: the remaining 356ms for 1000 files is now dominated by the real `files:list` IPC/disk round trip (reading 1000 real files off disk across the Electron IPC boundary), not rendering. Not investigated further this pass — see `PERFORMANCE_GUIDE.md` §1a Follow-ups and `TASKS.md`.
- Full suite re-verified green: 553 desktop tests (was 548), lint/typecheck clean, full 17-test Playwright E2E suite re-run (15 passing + 2 clean skips, faster overall — 18.8s vs. 30.0s).

### Added — Barrel exports, closing out Phase 2's last real gap (2026-08-11)

- `index.ts` barrel exports added for every real (non-empty) `apps/desktop/src/` module beyond the pre-existing `components/ui/`/`store/`: `hooks/`, `services/`, `lib/`, `layout/`, and 13 `features/*` subdirectories (`agent`/`auth`/`browser`/`chat`/`command-palette`/`docker`/`editor`/`file-explorer`/`git`/`settings`/`terminal`). `features/search`/`features/extensions` skipped — both are empty scaffolds with nothing to export.
- `tsc --noEmit`/`eslint` both clean (no export-name collisions across any directory), full desktop test suite (548 tests) re-verified green.
- Backend `__init__.py` re-exports (also named in Phase 2's original scope) deliberately **not** added — verified every one of the 130 real backend source files uses direct, explicit module imports (never a package-level re-export), a consistent convention across every backend-touching phase so far. Adding re-exports now would contradict the established style rather than complete it; documented as intentionally not applicable in `PROGRESS.md`'s Phase 2 entry, not an oversight.
- `PROGRESS.md`'s Phase 2 entry also corrected: its prior "TypeScript type stubs"/"Pydantic schema stubs" framing described the repository as it was on 2026-08-03, before 13 phases of real feature work landed the real types/schemas each phase actually needed — not a separate stub-filling pass this session performed. Phase 2 raised from a stale 15% to 90%.

### Added — Phase 18 (Optimization), 5/8 acceptance criteria met + 1 N/A (2026-08-11)

The last of the 18 roadmap phases.

- **All 10 NFR targets from `PERFORMANCE_GUIDE.md` §1 measured for real** — documented in a new §1a "Baselines" section. Method: launch the real app via Playwright's `_electron.launch()` (the same mechanism Phase 16's E2E suite uses) and read real Chrome DevTools Protocol metrics, not estimates. **Met:** cold startup 1458ms (<2s target), backend API p99 63.5ms over 200 real requests against `/health/ready` — a real `SELECT 1` + real Redis `PING` (<200ms target), renderer memory with 10 real files open as 10 real Monaco tabs at 23.9–43.4MB (<400MB target), embedding batch calls (`EmbeddingService.embed()` passes the full `texts: list[str]` in one provider call, verified by code inspection). **Missed, real and investigated, not guessed at:** warm startup ~1220ms (~220ms over 1s), file open 106ms (6ms over 100ms, one sample), initial bundle 695.59KB (over 500KB — see below), file tree with 1000 real files 1265ms (~25x over the 50ms target — see below). **Blocked on real infrastructure this environment doesn't have:** AI TTFT local/cloud (no Ollama, no cloud API keys) and semantic search (no workspace has ever been indexed) — same "environment gap, not a code gap" category as every other live-external-dependency gap this project has flagged throughout its history. Editor keystroke latency and terminal input lag need real interactive Chrome DevTools profiling this no-display environment can't drive.
- **Real bundle analyzer wired in**: `rollup-plugin-visualizer` added to `apps/desktop`, invoked via `ANALYZE=1 pnpm build` (writes a real treemap to `dist-analyze/renderer-stats.html`) — `PERFORMANCE_GUIDE.md` §7's previous `pnpm build:renderer --analyze` placeholder command never actually existed; replaced with the real one. Used it to find one real, safe fix: `Settings`/`AuthDialog` in `App.tsx` were eagerly imported despite neither being needed for first paint (both open only on an explicit user action) — lazy-loaded the same way the 5 sidebar panels already were. **703.92KB → 695.59KB.** Still over the 500KB target — the remaining bulk is legitimately-eager React/ReactDOM/Zustand/Immer/Radix UI + this app's own always-visible shell code (layout, file explorer, command palette), not an easy further extraction; a real, honestly-documented gap.
- **File tree virtualization identified as the highest-value fix this pass surfaced, deliberately not implemented in the same pass**: 1000 real files in a real temp workspace measured at 1265ms to render (target: 50ms) — root cause confirmed by code inspection, not assumed: `FileTree`/`FileTreeNode` renders one real DOM node per file with zero virtualization (`@tanstack/react-virtual` is already a dependency, already proven elsewhere in this codebase — `ChatMessageList.tsx` — but `FileTree` is a **recursive** structure, not a flat list, so applying it means flattening the visible tree first and rewriting `FileTreeNode` to render one row instead of recursing into its own children, while preserving rename/delete/context-menu/drag-and-drop/git-decoration behavior and 13+8 existing tests). Correctly scoped as its own future slice with real regression risk, not rushed at the tail of this pass — tracked in `TASKS.md`. **Implemented later the same day** — see the "File tree virtualization, same-day follow-up" entry above.
- **`cachetools.TTLCache` for the completion cache: not applicable, not silently skipped** — no completion cache exists anywhere in the codebase, because inline AI code completions were never built (a real, already-documented Phase 17 finding in `docs/user-guide/AI_FEATURES.md`, not new to this phase).
- **Monaco web workers**: confirmed already correctly configured (`useMonaco.ts`'s per-language `MonacoEnvironment.getWorker` routing) by code inspection — no fix needed.
- **`pnpm -r run test` still passes after all optimizations**: re-verified for real — 548 desktop tests + 369 backend tests + 3 skipped, all green; the full 17-test Playwright E2E suite was also re-run against the rebuilt app (15 passing, 2 cleanly skipped without a reachable backend, unchanged from before this phase's changes).
- **Doc-drift correction:** `PROGRESS.md`'s prior "Not Started" entry for this phase claimed it also covered a security audit and an accessibility audit — `docs/roadmap/phase-18-optimization.md`'s real acceptance criteria (re-read in full before starting) are exclusively performance/NFR-related. Neither audit is part of this phase's real scope; flagged as pre-existing stale framing, not a gap this phase silently skipped.

### Added — Phase 17 (Documentation), 5/6 acceptance criteria met (2026-08-11)

- **Root `Makefile` + `CONTRIBUTING.md`** — `install`/`dev`/`test`/`lint`/`typecheck`/`build`/`migrate`/`generate-types` targets. `make dev` brings up Postgres/Redis (`docker compose up -d db redis`), applies migrations (advisory-lock-protected `alembic upgrade head`), then runs `pnpm dev`. Every command verified for real while writing the guide: `make infra-up`/`make migrate` both ran successfully against real Docker containers; `pnpm dev` genuinely started both the backend (`Uvicorn running on http://127.0.0.1:8000`) and the desktop app's Vite/Electron-main/preload build — only the final Electron GUI launch hit this sandbox's already-documented missing-shared-libs issue, noted inline as container-specific, not a real-machine concern.
- **All 10 ADRs** (`docs/adr/0001`–`0010`), each with a real "Outcome" section reporting what actually happened, not templated boilerplate. Two are genuinely uncomfortable findings, reported honestly rather than smoothed over: **ADR 0004** (Celery for background tasks) was decided but never implemented — real production code (agent task execution, Phase 8; chat streaming, Phase 10) runs via in-process `asyncio.create_task()` instead, a real load-bearing gap (agent tasks don't survive a backend restart, no cross-process queue). **ADR 0007** (OpenAPI-generated TypeScript types) was also unimplemented for most of this project's history — `packages/desktop-types/` was an empty scaffold (no `package.json`, no generated file) until this session.
- **`packages/desktop-types/` built for real**, closing half of ADR 0007's gap: a real `package.json` (making it an actual pnpm workspace member), and a real generated `src/api.d.ts` (1645 lines, `tsc --noEmit --strict` clean) — produced by starting the real backend, fetching its real live `/openapi.json` (23 routes), and running `openapi-typescript` against it, verified via both command forms (piped through `/dev/stdin`, and the direct-URL form the phase's own acceptance criterion names literally). The desktop app does not yet import from this package anywhere — `src/types/*.ts` remains fully hand-written; migrating call sites over is a distinct, larger refactor out of this phase's scope, tracked in `TASKS.md`.
- **`docs/api/`** (4 files: `REST_REFERENCE.md`, `WEBSOCKET_EVENTS.md`, `ERROR_CODES.md`, `AUTHENTICATION.md`) — generated by reading the real live OpenAPI schema (23 endpoints) and the real `app/api/ws/event_types.py`/`app/core/errors.py` source (every `code="..."` string in the codebase, grepped, not guessed), not transcribed from a design doc.
- **`docs/user-guide/`** (11 files) — each honestly scoped: `AI_FEATURES.md` states inline completions and AI code review aren't built; `THEMES.md` states no community-theme system exists; `PLUGINS.md` states no plugin runtime exists and explains why (no phase in the 18-phase roadmap ever builds one, despite `PLUGIN_SYSTEM.md`'s detailed design doc existing); `GIT_INTEGRATION.md`/`TERMINAL.md`/`BROWSER.md`/etc. describe only real, shipped behavior.
- **`docs/plugin-authoring/`** (`GETTING_STARTED.md`, `MANIFEST_REFERENCE.md`, `API_REFERENCE.md`, `PERMISSIONS.md`, `SANDBOX.md`, `DISTRIBUTION.md` + a `hello-world` example) — faithfully documents `PLUGIN_SYSTEM.md`'s real, pre-existing design (not fabricated beyond it) with an explicit "planned design, not runnable" banner on every file. The Hello World walkthrough (manifest + entry point matching the documented `PluginAPI` shape) satisfies the phase's own "complete Hello World plugin walkthrough" acceptance criterion at the design level — it cannot actually run against a real build, and every file says so rather than implying otherwise.
- **`TESTING_STRATEGY.md` §6.1/§6.2 rewritten** to match Phase 16's real E2E suite — the original design-time sketch used `getByTestId`-based selectors (no `data-testid` attribute exists anywhere in this codebase's actual convention) and listed a stray 9th "install and activate a plugin" flow that was never part of `phase-16-testing.md`'s real 8-flow list (no plugin system was ever built) — fixed to the roadmap doc's authoritative list and a real example from `git.spec.ts`.
- **`PROJECT_MASTER_SPEC.md`'s status line** deliberately does not say "v1.0.0 shipped" — this phase's own file-to-modify instruction, not followed literally since it would be false (no code signing, no plugin runtime, no RAG indexing, no live CI run). Updated instead to point at `PROGRESS.md`'s real ~75%-at-the-time status and name what's genuinely still open.
- **1 criterion partially met:** "a developer who's never seen the project can run `make dev` in under 30 minutes using only `CONTRIBUTING.md`" — every individual command verified working for real, but not literally timed against a fresh clone by an uninvolved developer.
- **1 criterion narrowly scoped:** "no broken links in any documentation file" — verified via a real relative-link-resolution check for every file created/modified this session; not re-run across the full pre-existing 21-root-doc + `docs/roadmap/` corpus.

### Added — Phase 16 (Testing), 6/7 acceptance criteria met (2026-08-11)

- **Real coverage gates, both passing with real margin:** backend `pytest --cov-fail-under=85` was found already wired in `pyproject.toml` (pre-existing, uncommitted work never reconciled into `PROGRESS.md`/`TASKS.md` — verified for real before crediting it, same drift pattern this project has hit before) — genuinely passes at **90.74%** (369 tests + 3 environment-gated skips). Desktop gained the matching gate: `vitest.config.ts`'s `coverage.thresholds` (`lines`/`statements` = 80), `apps/desktop/package.json`'s `test` script changed from `vitest run` to `vitest run --coverage` so the gate applies to the exact command CI and a contributor both run — measured at **83.3%** after filling 3 real, previously-untested gaps (`useTerminal.test.ts`, `useCommandPalette.test.ts`, `CommandPalette.test.tsx` — 44 new tests). Agent-tool-specific backend coverage (`app/agents/tools/*`, the phase's "highest risk code" criterion) measured separately at **93.5%**, above its own 90% target.
- **`src/test/setup.ts` gained a `window.matchMedia` jsdom stub**, alongside the existing `ResizeObserver` one — xterm.js's `CoreBrowserService` calls it unconditionally on construction, so any test mounting a real `Terminal` needed it.
- **8 real, executable Playwright-Electron E2E specs** (`apps/desktop/tests/e2e/`, new `playwright.config.ts` + `tsconfig.e2e.json` third TS project): `workspace-and-editor`, `chat`, `agent`, `git`, `terminal`, `search-and-navigation`, `theme-and-settings`, `auto-update.spec.ts` — matching `phase-16-testing.md`'s 8-flow list. `tests/e2e/fixtures/electron-app.ts` launches the real `out/main/index.js` build output directly (no packaging step needed) via `_electron.launch()`; `tests/e2e/fixtures/workspace.ts` creates a real temp directory + real `git init`-ed repo per test. 15 of 17 test cases pass for real; `chat.spec.ts`/`agent.spec.ts` check real backend reachability (`fetch` against `/health/live`) and skip cleanly without one, the same pattern the backend's own OAuth/live-API/Chromium tests already use.
- **`window.__rasikTestStore`** (`main.tsx`, real `useAppStore` export) and **`window.__rasikTerminals`** (`useTerminal.ts`, real `Map<id, Terminal>`) — E2E test hooks exposed unconditionally (not dev-only): `contextIsolation: true` + `script-src 'self'` CSP already mean the renderer only ever runs this app's own bundled code, so neither crosses a real trust boundary. `openWorkspace()`/`setSidebarView()` drive real store actions (the same code path drag-and-drop already used for the former) instead of fighting an unautomatable native OS file-picker dialog; `readTerminalText()`/`getActiveTerminalId()` read a real terminal's actual screen buffer.
- **Two real, non-obvious findings from testing this for real, not assumed:** (1) this sandboxed dev container has no display server, and Electron doesn't officially support headless operation the way Chromium does — yet `_electron.launch()` genuinely renders and is drivable here with zero `Xvfb` setup, verified empirically before committing to building the E2E suite at all. CI's `test.yml` still installs `Xvfb` as a safety net for less permissive runners. (2) xterm.js's `WebglAddon` (already loaded by `useTerminal.ts` with a headless-environment fallback) is genuinely active in this real app, meaning terminal output renders to `<canvas>`, not DOM text — `terminal.spec.ts`'s first draft asserting on `.xterm-screen`'s text silently read empty strings until `window.__rasikTerminals` was added to read `term.buffer.active` directly.
- `.github/workflows/test.yml` gained an `Install Xvfb` + `E2E (Playwright, real Electron)` step after the existing build step; `workflows/README.md` updated to match.
- `TESTING_STRATEGY.md` §6.1/§6.2 rewritten to match what was actually built — the original design-time sketch used `getByTestId`-based selectors (no `data-testid` attribute exists anywhere in this codebase) and listed a stray 9th "install and activate a plugin" flow that doesn't match `phase-16-testing.md`'s real 8-flow list (no plugin system was ever built) — fixed to the roadmap doc's authoritative list.
- **Not built, explained, not silently dropped:** a real Windows/macOS E2E CI matrix run (needs an actual push to the remote, same category as every other "first real CI run" gap this project has flagged). `auto-update.spec.ts` verifies the real dev-mode no-op path, not a full mocked-update-server download → restart-prompt cycle (electron-vite bundles the whole main process into one file, so there's no separate `auto-updater.js` module to reach from a test in isolation). `chat.spec.ts`/`agent.spec.ts` verify the panels are real and reachable, not a full send-message/approve-a-step round trip (needs a seeded test account + reachable Ollama model neither this harness nor CI provisions).

### Changed — `electron/main/index.ts` split into `window-manager.ts` + `ipc-registry.ts` (2026-08-11)

- Pure architectural cleanup, no attached acceptance criterion (`TASKS.md`'s Phase 3 backlog): `window-manager.ts`'s `WindowManager.createWindow()` now owns `BrowserWindow` creation/lifecycle (moved unchanged from `index.ts`); `ipc-registry.ts`'s `registerAllIpcHandlers()` now owns every `registerXHandlers()` call in one place. `index.ts` shrank from ~80 lines mixing window creation, all 9 IPC handler registrations, and app-lifecycle wiring to ~30 lines of just the lifecycle wiring.
- No behavior change — verified via a real packaged-build launch (`electron-builder --dir`, the binary run for a bounded `timeout` window without crashing, the same method Phase 15 established for verifying a packaged build in this no-display environment) plus the full existing desktop test suite (530 tests) staying green, `tsc`/`eslint` clean.

### Added — Phase 12 gap-closing: Git branch switcher, commit log, push/pull UI (2026-08-11)

- **`src/features/git/BranchSwitcher.tsx`** (new) — replaces `GitPanel.tsx`'s read-only branch-name span with a clickable trigger that opens a picker (built on the existing `Dialog` primitive, not a new `@radix-ui/react-dropdown-menu` dependency), grouped into Local/Remote, current branch highlighted and disabled. `GitService.branches()`/`checkoutBranch()` (Phase 12) already existed and were tested; nothing in the UI called them until now.
- **`src/features/git/CommitLog.tsx`** (new) — a full-panel history view (same swap-the-main-panel-content pattern `DiffViewer`/`ConflictResolver` already use), listing `hash`+`message` per commit (`GitLogEntry`'s real, full shape — no author/date field exists in the backend contract). `GitService.log()` already existed and was tested; nothing called it either.
- **`GitPanel.tsx`** header gained Pull/Push/History buttons. Push/pull surface the *real* `git` CLI output as their result message (`GitService.push()`/`.pull()`'s actual return value — e.g. "Everything up-to-date" or a real rejection message), not a synthesized "Pushed!" string, shown in a small message row (error styled red) that clears on the next status refresh.
- `git-slice.ts` gained `refreshGitLog`/`push`/`pull` + their state (`gitLog`, `gitPushing`/`gitPulling`, `gitPushPullMessage`/`gitPushPullError`).
- 24 new/updated tests: `git-slice` (+6: `refreshGitLog`, `push`/`pull` success and failure paths), `BranchSwitcher.test.tsx` (5, real dialog interaction via Testing Library), `CommitLog.test.tsx` (3), `GitPanel.test.tsx` (+3: Push/Pull/History button wiring). `tsc`/`eslint` clean, full desktop suite green (530 tests, up from 514), production build re-verified — `GitPanel`'s lazy chunk grew from ~19KB to 27.69KB with the two new components folded in.
- Not part of Phase 12's own formal 10 acceptance criteria (still 8/10, unaffected) — these three were open `TASKS.md` backlog items ("no UI entry point yet" for push/pull, "no branch-switcher UI," "no commit log view"), not a re-scoring of the phase itself.

### Added — Phase 3 gap-closing: LSP integration (2026-08-11)

- **`electron/main/lsp-manager.ts`** (new) — `LspManager`: spawns/manages one child-process language server per language (TypeScript, Python, JSON), speaking real LSP over stdio via `vscode-jsonrpc`'s `createMessageConnection`. Catch-all `onNotification`/`onRequest` handlers forward every server-pushed notification (diagnostics, etc.) to the renderer and answer server-initiated requests (`workspace/configuration`, `client/registerCapability`, ...) with minimal-but-valid replies so a real server never blocks waiting on capability negotiation this app doesn't implement. `start()` is idempotent per `(language, workspaceRoot)`, restarts on a workspace change, and has a 20s `initialize` timeout. Mirrors `PtyManager`'s established shape (`stop`/`stopAll`, `BrowserWindow` broadcast for the single-window limitation).
- **`electron/main/ipc/lsp-handlers.ts`** + preload `window.rasik.lsp.*` + `src/types/lsp.ts` — `start`/`request`/`notify`/`stop`/`onNotification`, following the exact `git-handlers.ts` `IpcResult` pattern.
- **`src/features/editor/lsp-client.ts`** (new) — renderer-side integration: starts servers on demand, registers Monaco hover/definition providers once per language, keeps servers in sync with open documents (`didOpen`/`didChange` deduped by `model.getVersionId()`/`didClose`), and applies `publishDiagnostics` as `monaco.editor.setModelMarkers`. Wired into `MonacoEditor.tsx` at the 3 points that already own the model lifecycle (create, active-model-content-change, dispose) — no new component, no new store slice.
- **Architecture deviation from `phase-03-desktop-application-shell.md`'s "LSP integration architecture" section, documented deliberately:** the roadmap doc names `monaco-languageclient` for the client side. Its current major (v10) pulls in ~30 `@codingame/monaco-vscode-*` packages (a full VSCode-workbench API emulation layer) and requires replacing this app's raw `monaco-editor` package with `@codingame/monaco-vscode-editor-api`'s own distribution — a ground-up rewrite of `MonacoEditor.tsx`, disproportionate to what this app actually needs (hover/go-to-definition/diagnostics, not a full extension host) and contrary to Phase 3's own already-established preference for wrapping Monaco directly rather than a heavier abstraction (`useMonaco.ts`'s doc comment). Built a minimal client directly on `vscode-jsonrpc` + `vscode-languageserver-protocol` (types only) instead — registers native Monaco providers and converts LSP shapes by hand (~250 lines, `lsp-client.ts`). `AGENT_FRAMEWORK.md`'s `get_diagnostics` tool (previously blocked on "no real LSP client") is unblocked by this — not wired up this session, tracked in `TASKS.md`.
- **3 bundled/resolved language servers:**
  - TypeScript: `typescript-language-server` (new npm dependency) — handles both `.ts`/`.tsx`/`.js`/`.jsx`.
  - JSON: `vscode-langservers-extracted`'s `vscode-json-language-server` (new npm dependency).
  - Python: no equivalent pure-JS server exists to bundle. Resolved at runtime — `pylsp` on the user's PATH first (respects their own environment), else `uv`/`uvx` (already a real dependency of this monorepo's own backend tooling) via `uvx --from python-lsp-server pylsp`. Neither present → `start()` rejects with a real, user-facing message rather than silently doing nothing; this is a genuine, honest scope boundary (no end-user Python runtime bundled), not an oversight.
- **`typescript` moved from `apps/desktop`'s `devDependencies` to `dependencies`** — it's now a real runtime requirement (the bundled TS language server resolves it), not just a build-time tool.
- **Real, non-mocked verification at every layer, several genuine bugs caught along the way, not assumed away:**
  - Direct `vscode-jsonrpc` smoke tests against all 3 real servers (`typescript-language-server` hover on a real file in this repo, `vscode-json-language-server` initialize, real `pylsp` via `uvx` returning 38 real document symbols from `apps/backend/app/core/config.py`) before any manager code was written.
  - **Real bug caught by testing the actual runtime path, not just the protocol logic:** `process.execPath` inside Electron's main process is the Electron binary itself, not plain Node — spawning the bundled TS/JSON server scripts through it without `ELECTRON_RUN_AS_NODE=1` would have tried to launch them as if they were whole Electron apps. Caught by re-running the smoke test through the *real* Electron binary (worked around this sandbox's missing `libnspr4`/`libnss3`/`libasound` the same `apt-get download` + `dpkg-deb -x` + `LD_LIBRARY_PATH` technique Phase 13/15 used for Chromium) before it was assumed to work — failed the first time, fixed by adding `ELECTRON_RUN_AS_NODE: '1'` to the spawned env, re-verified passing.
  - **Real bug caught by full-suite test contention, not by review:** `connection.sendNotification()`'s returned promise can reject when a write races the server process exiting (e.g. `stop()` disposing the connection while a notification is in flight) — `vscode-jsonrpc` internally re-throws inside its own `.catch()`, and this code wasn't awaiting the returned promise, producing an unhandled rejection that only showed up under real full-test-suite timing, not in isolation. Fixed by awaiting `sendNotification()` in both call sites; a defensive `child.stdin.on('error', ...)` guard was also added (the EPIPE that surfaces this way is a normal shutdown race, not a bug to crash on).
  - **`asarUnpack` investigated and simplified, not just added defensively:** initially added `asarUnpack` globs for the 3 new server packages (matching `node-pty`'s existing entry) as a defensive default. A real `pnpm package` build showed they weren't actually being unpacked (a pnpm-hoisting quirk in electron-builder's glob matcher, root-caused far enough to rule out a `lsp-manager.ts` bug but not worth a full electron-builder investigation) — rather than force the unpack to work, tested whether it's even necessary: spawned `typescript-language-server`'s `cli.mjs` as a **real child process straight out of a real packaged `app.asar`**, unpacked, via `ELECTRON_RUN_AS_NODE`, and it worked — Electron's asar transparency covers spawned `ELECTRON_RUN_AS_NODE` children (including their own nested `require`/`import` resolution) the same way it covers in-process `require()`. `asarUnpack` reverted to just `node-pty` (which genuinely needs it — a native addon can't `dlopen()` from inside an archive), re-verified against a fresh full packaged build.
  - **`languageForPath`'s existing model-creation code passed a workspace-*relative* path to `monaco.Uri.file()`** (pre-existing, from Phase 3) — harmless before now since nothing read `model.uri`, but LSP servers key documents by real absolute filesystem URIs (diagnostics, go-to-definition targets, etc. all come back keyed by them). Fixed in `MonacoEditor.tsx` to join with `workspaceRoot` before constructing the model's URI — required plumbing for this feature to work at all, not scope creep.
- 6 new `lsp-manager.test.ts` tests against a **real spawned `typescript-language-server` process** (matches `docker-service.test.ts`/`git-service.test.ts`'s "real behavior beats a mock" standard for this project) — real `initialize`, idempotent restart, real hover on a real file, rejection for a never-started language, `stop()` teardown, real diagnostics forwarded to `BrowserWindow`. 8 new `lsp-handlers.test.ts` tests (mocked `LspManager`, matches `terminal-handlers.test.ts`'s pattern). 14 new `lsp-client.test.ts` tests — a hand-built fake `Monaco` object standing in for the real one (the real `monaco-editor` package is never imported at runtime by `lsp-client.ts`, only as an erased `import type`, so this file is **not** subject to the `monaco-editor`-dynamic-import-under-Vitest gap that's kept `MonacoEditor.tsx` itself untested since Phase 3).
- **Not built this session, tracked in `TASKS.md`:** completion/code-action providers (only hover/definition/diagnostics — the 3 Phase 3 acceptance criteria actually ask for hover+go-to-definition), wiring `get_diagnostics` (Phase 8's agent tool) to this new real LSP client, visual/interactive verification of hover/diagnostics rendering in a running window (no display server in this environment — same standing gap as the rest of the desktop shell).

### Added — Phase 15 (Deployment Pipeline), 9/10 acceptance criteria met (2026-08-07)

- `.github/workflows/test.yml`/`security.yml`/`release.yml` + `.github/dependabot.yml` — `test.yml` runs `pnpm lint`/`typecheck`/`test`/`build` (the exact local dev commands); `security.yml` runs `truffleHog`, `pip-audit`, `pnpm audit --audit-level=high`; `release.yml` (triggers on `v*` tags) calls both as reusable `workflow_call` jobs so `needs: [test, security]` is enforced literally, then builds Windows/macOS/Linux via `electron-builder ... --publish always` and pushes the backend image to GHCR. `dependabot.yml` placed at its actual required location (`.github/dependabot.yml`, not inside `workflows/`, where GitHub would never have read it).
- **Real security finding, fixed:** building `security.yml` meant running `pnpm audit` for the first time ever in this project — 37 vulnerabilities (1 critical, 8 high), including 3 unpatched high-severity CVEs in `electron@^32.2.0` (a context-isolation bypass among them) on a fully-EOL Electron major. Upgraded to Electron 39.8.10 (minimum version fixing all three, chosen over latest 43.x to bound compatibility risk in a no-display environment — user's explicit choice), cascading `vite`→6.4.3, `electron-vite`→3.1.0, `@vitejs/plugin-react`→5.2.0, `vitest`→3.2.6 (its own critical CVE) for peer compatibility, plus a `pnpm dedupe` to collapse a duplicate transitive `vite` copy. Result: 0 vulnerabilities.
- **Verified beyond typecheck/tests:** a real `electron-builder --dir --linux` package was built and actually launched — `@electron/rebuild` auto-recompiled `node-pty` against Electron 39's ABI, and the binary ran without crashing for a bounded `timeout` window (worked around this sandbox's missing GTK/NSS libs the same way Phase 13 worked around missing Chromium libs). `electron/main/auto-updater.ts` (new — launch + 4-hour update check, background download, "Restart Now/Later" dialog, 6 tests) was confirmed running for real inside that launch.
- `apps/backend/Dockerfile` hardened: `uv sync --frozen --no-dev`, ships `alembic/`+`alembic.ini` (a deployed image can now actually run migrations), runs as a non-root `rasik` user, adds a `HEALTHCHECK` against `/health/live`. Verified with a real `docker build`+`docker run`: non-root confirmed via `whoami`, health endpoint returns 200, `docker inspect` health status reaches `healthy`.
- App icons (`build/icon.ico`/`.icns`/`icons/*.png`) — previously entirely missing, blocking `pnpm build:win/mac/linux` outright. Generated programmatically (Pillow `ImageDraw`, no font dependency): a `</>` mark in the app's own editor-background/accent-blue colors. `build/entitlements.mac.plist` (new) wired into `electron-builder.config.ts`'s `mac.entitlements`/`entitlementsInherit`; `mac.notarize` fixed from implicit `undefined` to explicit `Boolean(process.env['APPLE_ID'])` (and from an outdated object-shaped API that doesn't typecheck against electron-builder v24+'s real `boolean` field).
- **Real pre-existing bug found and fixed, unrelated to this phase's own scope:** the actual root `pnpm lint` command had never been run to completion by any prior session (earlier "lint clean" claims used a narrower glob that avoided the affected file). Root-caused via isolated bisection: ESLint 9's inline-disable-comment validation fails to find a plugin's rules when its config block uses an anchored, multi-literal-segment `files` glob alongside `typescript-eslint`'s recommended config — not an `eslint-plugin-react-hooks` flat-config bug as `TASKS.md` previously assumed. Fixed by broadening the glob to `**/src/**/*.{ts,tsx}`.
- Also fixed while wiring `turbo.json`'s new `typecheck` task: bare `tsc --noEmit` (used throughout every prior session) only checks the renderer `tsconfig.json`, silently skipping `tsconfig.node.json` (Electron main) — surfaced 2 pre-existing type errors plus 2 new ones in this phase's own test files, all from `vi.fn()` mocks whose zero-arg implementation made `.mock.calls[N]` type as an empty tuple; fixed via explicit `vi.fn<(...args: unknown[]) => T>()` generics.
- Migrated `vitest.workspace.ts` (deprecated in Vitest 3) to `vitest.config.ts`'s `test.projects`.
- **Not built, explained:** signed/notarized macOS builds and Windows code signing both need real paid accounts/certificates this session can't provision. No live GitHub Actions run of any new workflow — needs a real push to the remote.

### Added — Phase 14 (Docker Integration), all 5 acceptance criteria met (2026-08-06)

- `electron/main/docker-service.ts` — `DockerService`: `listContainers()`/`start()`/`stop()`/`restart()`, all via `execFile('docker', [...])` (never a shell string), matching `GitService`'s established pattern. `docker ps -a --format '{{json .}}'` is parsed as real per-line JSON.
- `electron/main/docker-log-stream.ts` — `DockerLogStreamManager`: spawns `docker logs -f --tail 200 {id}` as a long-running child process and streams stdout/stderr chunks to the renderer over `docker:logs:data:{id}`, mirroring `PtyManager`'s `terminal:data:{id}` broadcast pattern.
- `pty-manager.ts`'s `PtySessionOptions` gained an optional `command`/`args` override — "open shell in container" spawns `docker exec -it {id} /bin/sh` through the existing PTY/xterm pipeline instead of a second terminal implementation.
- `electron/main/ipc/docker-handlers.ts` + preload bridge (`window.rasik.docker.*`) + `src/types/docker.ts`.
- `src/store/docker-slice.ts` + `src/features/docker/{DockerPanel,ContainerList,ContainerItem,ContainerLogs}.tsx` — container list with state-colored status dots, start/stop/restart, a log stream capped at 200K buffered characters, and "open shell" wired straight into the existing terminal tab bar. `ActivityBar`/`App.tsx`/the native menu all gained a Docker entry (`Ctrl+Shift+D`).
- Dockerfile syntax highlighting needed no new code — `language-config.ts` already mapped it to Monaco's built-in `dockerfile` language.
- **Real, non-mocked verification:** `docker-service.test.ts` spins up a real throwaway `redis:7-alpine` container per test and drives it through real start/stop/restart state transitions — the same standard `git-service.test.ts` set for Phase 12. 40 new desktop tests total (279 desktop tests overall, up from 239).
- **Real bug caught by the component test:** `ContainerLogs.tsx`'s auto-scroll used `element.scrollTo(...)`, which jsdom doesn't implement — fixed to a plain `scrollTop` assignment.
- **Housekeeping:** this session found the task-tracking state at its start claiming Phase 1 (ADRs), Phase 2 (barrel exports), Phase 15 (CI workflows), and part of Phase 12 (branch switcher/commit log/push-pull UI) were already done. None of that work existed in the repository — corrected before starting Phase 14 rather than building on a false premise.

### Added — Phase 13 (Browser), all 9 acceptance criteria met (2026-08-05)

- `app/infrastructure/browser/ssrf_guard.py` — blocks navigation before any network activity: only `http`/`https` schemes allowed (`file:`/`data:`/`javascript:` rejected), and every DNS-resolved address (IPv4 + IPv6, every address for a round-robin hostname) checked against private/loopback/link-local/multicast/reserved/unspecified ranges. 16 unit tests, including the roadmap's own literal examples (`169.254.169.254`, `localhost:5432`).
- `app/infrastructure/browser/playwright_service.py` — `PlaywrightBrowserService`: one headless Chromium instance per workspace, lazy-started on first use, closed after 30 minutes idle by a background sweep. Idle timeout and check interval are constructor-injectable, so the real idle-closing behavior is verified with a real sub-second timeout in tests — unlike Phase 7's WebSocket gateway, whose 30s idle timeout was left permanently untested for exactly this reason.
- `app/agents/tools/browser_tools.py` — `browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`/`browser_get_text`, wired into the tool pool and into `ResearcherAgent` (closing its own documented "and web" gap; click/type excluded there to keep it read-only). Risk levels: navigate Medium (SSRF-guarded), screenshot/get_text Low (reads), click/type High (real, irreversible actions on an arbitrary website — same category as `write_file`/`run_command`).
- No new WebSocket streaming path needed for screenshots — every tool result already streams to the desktop via the existing `AgentStepEvent` pipeline, so `browser_screenshot`'s base64 PNG data URI gets there "for free."
- **Real, non-mocked verification:** Chromium doesn't launch out of the box in this sandboxed dev environment (missing shared libraries, no root) — worked around for local verification via `apt-get download` (no root needed) + `dpkg-deb -x` + `LD_LIBRARY_PATH`, proving a real headless browser navigates, screenshots (verified real PNG magic bytes), clicks, types, and gets SSRF-blocked, all against a real local `http.server`. The actual shipped fix, `apps/backend/Dockerfile`'s new `playwright install --with-deps chromium` line, was independently verified with a real `docker build` + a real navigate→screenshot check run inside the built container. The 3 real-Chromium integration tests skip cleanly when Chromium isn't launchable, same category as Phase 6/9's live-API gaps.
- `electron/main/browser-view.ts` — `BrowserViewManager`: a real `WebContentsView` on its own `persist:browser` session partition, positioned by the main process to overlay `BrowserPanel.tsx`'s placeholder `<div>`. Back/forward/reload via `webContents.navigationHistory`; state pushed to the renderer on every navigation/loading/title event.
- `src/features/browser/BrowserPanel.tsx` (address bar, nav controls, `ResizeObserver`-synced bounds, hides the native view on unmount) + `AgentBrowserView.tsx` (renders a `browser_screenshot` step's data URI inline in `AgentStepTimeline.tsx` instead of a raw base64 text dump). `ActivityBar` gained a Browser icon; `Ctrl+Shift+B` / `View: Show Browser` / the native menu's "Browser" item all switch to it.
- 46 new backend tests (372 total) and 35 new desktop tests (239 total). `mypy`/`ruff`/`tsc`/`eslint` all clean; a full desktop production `pnpm build` re-verified, `BrowserPanel` landing as its own lazy chunk.
- Doc fixes: `AGENT_FRAMEWORK.md`'s tool table and deferred-tools section updated (18/19 tools now built); `apps/backend/app/agents/tools/README.md`'s file table updated (was still labeled "Phase 8" for files that aren't, and had a stale `run_tests` risk level).

### Added — Phase 12 (Git Integration), 8/10 acceptance criteria met (2026-08-05)

- `electron/main/git-service.ts` — `GitService`: `status`/`stage`/`unstage`/`commit`/`diff`/`showFile`/`log`/`branches`/`checkout`/`push`/`pull`, all via `execFile('git', [...])` (never a shell string), per ADR 0008 (CLI subprocess, not `libgit2`).
- `electron/main/lib/git-status-parser.ts` — parses `git status --porcelain=v2 --branch --find-renames`. Every field offset verified against real `git status` output captured from a scratch repository (including an actual merge conflict and a real ahead/behind-tracking remote), not written from the man page alone.
- **Real edge case caught by the test suite:** `git restore --staged` fails with `could not resolve HEAD` in a zero-commit repository — `GitService.unstage()` catches this and falls back to `git rm --cached`.
- `app/application/git/generate_commit_message.py` + `app/api/v1/git.py` (`POST /git/generate-commit-message`) — routes the staged diff through the existing `ModelRouter`, same pattern chat/agents already use. Truncates an oversized diff (20K chars) before sending.
- Desktop `features/git/`: `GitPanel`, `GitStatusSection`/`GitFileItem` (color-coded status letters), `CommitPanel` (message box + AI "Generate" + Commit), `DiffViewer` (a real Monaco **diff editor** — before/after are two real file versions via `git show`/`files:read`, not `git diff`'s unified-text output), `ConflictResolver` (parses git's own `<<<<<<< / ======= / >>>>>>>` markers via the new `src/lib/conflict-parser.ts`, offers Accept Current/Incoming/Both per block, writes back + stages). `store/git-slice.ts` ties it together; `ActivityBar` gained a Source Control icon, `Ctrl+Shift+G` switches to it, `StatusBar` shows the current branch, `FileTreeNode.tsx` shows the same color-coded decorations directly in the file tree (a directory decorates with its most-urgent descendant's status).
- All git IPC handlers (`git:stage`/`git:unstage`/`git:diff`/`git:showFile`) validate every path through the existing `resolveWorkspacePath()` traversal guard.
- **2 of 10 acceptance criteria, both explained, not silently dropped:** conflict resolution is a dedicated panel with real accept-per-block actions rather than inline Monaco decorations (the roadmap doc's own file list already names a separate `ConflictResolver.tsx` — the intended shape); `DiffViewer.tsx`'s content-loading effect has no dedicated test because `monaco-editor`'s dynamic import fails to resolve in this Vitest/Vite setup (a pre-existing gap — `MonacoEditor.tsx` itself has had zero tests since Phase 3 for the same reason).
- 88 new tests (6 backend, 82 desktop — including 12 `GitService` tests against a **real throwaway git repository**, not mocked). `mypy`/`ruff` and `tsc`/`eslint` all clean; a full desktop production `pnpm build` re-verified, `GitPanel` landing as its own lazy-loaded chunk.

### Added — Phase 3 gap-closing: protocol handler + drag-and-drop; discovered already-built work reconciled (2026-08-05)

- **Repository re-verification before building further:** ran the full backend suite (238 unit + 79 integration) against real Docker Postgres/Redis, the full desktop suite, and `mypy`/`ruff`/`tsc`/`eslint` — all clean except one integration test (`test_user_scoped_event_reaches_only_that_user`, then on a re-run `test_cannot_update_someone_elses_workspace`) that fails intermittently, in a different test each time, only inside the full 79-test run. Isolated re-runs and a standalone 15-trial repro script (register → `/me` twice in a loop, against real Postgres/Redis) never reproduced it — logged as a known test-harness flake in `TASKS.md` rather than chased further; not reproducible enough to call it an application bug.
- **Discovered already built, not new work:** `safeStorage`-backed desktop access-token persistence (`electron/main/auth-storage.ts` + `ipc/auth-handlers.ts`, wired end-to-end through `auth-slice.ts`'s `restoreSession()`/`persistSession()`, called from `App.tsx` at startup), the full Settings UI panel (`features/settings/Settings.tsx` — Appearance/Editor/Backend sections, `Ctrl+,`), and the native application menu (`electron/main/app-menu.ts` — File/Edit/View/Terminal/Window/Help, wired into `index.ts`). All three were fully implemented and tested (15 + Settings + 4 tests respectively) but `PROGRESS.md`/`TASKS.md` still described them as unbuilt — same undocumented-work pattern the 2026-08-05 Phase 8 session found. Re-verified end to end (IPC → preload → store wiring, not just file presence) before crediting them.
- `electron/main/protocol-handler.ts` (new) — serves the built renderer bundle over a custom `app://renderer/...` scheme (`protocol.registerSchemesAsPrivileged` + `protocol.handle` + `net.fetch`) instead of `file://`. This is what `phase-03-desktop-application-shell.md`'s "V8 bytecode cache configured via Electron protocol handler" actually requires — Chromium only applies code caching to scripts loaded through its network stack, not raw `file://` reads. `index.ts` now registers the scheme at module load (before `app.whenReady()`, as Electron requires) and loads `app://renderer/index.html` in production. 6 new tests, including one documenting that the WHATWG URL parser itself already neutralizes a `../../etc/passwd`-style traversal attempt (the handler's own `join()`+`startsWith(root)` check is defence in depth on top of that, not the only thing preventing escape).
- Drag-and-drop workspace open (`TASKS.md`'s last open Phase 3-deferred item): `workspace:openPath` IPC handler (validates the dropped path is a real directory via `fs.stat`, mirrors `workspace:openFolder` minus the native dialog) + `webUtils.getPathForFile` bridged through preload (`File.path` was removed in Electron 32). `workspace-slice.ts` refactored so `openFolder()` and the new `openFolderAtPath()` share one `applyWorkspaceRoot()` implementation instead of duplicating the backend-sync/WS-connect logic. `FileExplorer.tsx`'s empty state is now a real drop zone with a "Drop to open this folder" hint. 10 new tests (`workspace-handlers.test.ts` 6, `FileExplorer.test.tsx` 4).
- Phase 3 raised from 55% to 85% (only LSP and the auto-updater remain); Phase 7 raised from 90% to 95% (its last two open items — token persistence, production-build re-verification — are what this session found already done/confirmed clean).
- 22 desktop test files, 128 tests total (up from 112 at session start), all passing; a full production `pnpm build` re-verified clean after the protocol-handler change.

### Added — Desktop ChatPanel + AgentPanel (2026-08-05, completes Phase 10 to 85%, Phase 8's UI follow-up)

- `apps/desktop/src/features/chat/{ChatPanel,ChatSessionList,ChatMessageList,ChatMessage,ChatInput}.tsx` — session create/select/delete, `@tanstack/react-virtual`-virtualized message list, markdown rendering with syntax-highlighted code blocks (`react-markdown` + `remark-gfm` + `rehype-highlight`, themed via the app's own CSS custom properties so it follows the dark/light toggle), active-file attach toggle, `Ctrl+Shift+C` to focus the input. One `ChatMessage` component handles both a finished message and the live-streaming one, instead of a separate `StreamingMessage.tsx`.
- `apps/desktop/src/store/chat-slice.ts` + `services/chat-client.ts` — sessions, per-session history, streaming reducers. `stream_chunk` deltas are buffered and flushed at most once per `requestAnimationFrame` (`createStreamBatcher`), satisfying the phase's "batched at max 16ms, no per-token re-render" criterion structurally.
- `apps/desktop/src/features/agent/{AgentPanel,AgentTaskList,AgentStepTimeline,AgentApprovalPrompt}.tsx` + `store/agent-slice.ts` + `services/agent-client.ts` — task create/select/cancel, a live step timeline (upserts on the "running" → "result" pair of `agent_step` events each step actually fires), and the human-approval-gate UI. Not part of Phase 8's own formal acceptance criteria (backend-only scope) but closes the "backend exists, nothing can reach it" gap.
- Shared desktop architecture both panels needed: `ui-slice.ts`'s `activeSidebarView` (`ActivityBar` went from one hardcoded Explorer icon to a data-driven Explorer/Chat/Agent Tasks list — `LeftSidebar.tsx`'s own pre-existing doc comment had already anticipated this); `workspace-slice.ts`'s `backendWorkspaceId` (the backend workspace UUID was previously discarded right after the WebSocket connected); `hooks/useAiEventBridge.ts` (wires every `stream_chunk`/`stream_end`/`agent_*` WS event into the store, mounted once at the app root so state updates regardless of which sidebar view is open); `auth-slice.ts`'s `setSession()` now also syncs the backend workspace if a folder is already open (signing in *after* opening a folder is the common order, not before).
- `components/ui/EmptyState.tsx` extracted after `ChatPanel`/`AgentPanel` each defined the identical "nothing to show" placeholder locally.
- New dependencies: `react-markdown`, `remark-gfm`, `rehype-highlight`, `highlight.js`, `@tanstack/react-virtual`.
- 25 new desktop tests (95 total, up from 70). `tsc --noEmit`, `eslint`, and a real production `pnpm build` all verified clean — `ChatPanel` and `AgentPanel` land as separate lazy-loaded chunks, not in the initial bundle.
- **Deliberately not built:** drag-and-drop file attach (the active-file toggle covers the same context need more simply); a live `GET /api/v1/models` catalog for the model selector (hardcoded shortlist instead, same pattern as `AGENT_TYPES`); post-session memory extraction (needs `memory_classifier.py`, doesn't exist).

### Added — Phase 10 (AI Chat, backend only) (2026-08-05)

- `app/application/chat/{create_session,list_sessions,get_session,delete_session}.py` — session CRUD, ownership-checked with the same don't-leak-existence 404 pattern as `workspaces.py`/`agents.py`.
- `app/application/chat/context_builder.py` — assembles context per `AI_ARCHITECTURE.md` §4: system prompt → workspace context (active file + RAG results, via `EmbeddingService`/`EmbeddingRepository.search()` against `code_embeddings`) → truncated history → current user message. RAG degrades to no context (not fabricated results) when a workspace has no indexed embeddings or the embedding provider is unavailable.
- `app/application/chat/send_message.py` + `app/api/v1/chat.py` — `POST /chat/sessions`, `GET /chat/sessions`, `GET /chat/sessions/{id}` (session + full history), `DELETE /chat/sessions/{id}`, `POST /chat/sessions/{id}/messages`. Sending a message persists the user's `Message` and returns immediately; the AI reply streams in an in-process background task, publishing `stream_chunk`/`stream_end` (already existed in `event_types.py` from Phase 7) over the session owner's WebSocket channel, then persists the assembled assistant `Message`.
- Long-history compression is inherited for free: `ModelRouter.stream()` already runs every request through Phase 9's `truncate_messages()`, so Phase 10 didn't need its own truncation logic.
- `app/core/background.py` — `fire_and_forget()` extracted from Phase 8's `run_task.py` (deduplicated, not reimplemented) so both phases share one "keep a strong reference to a fire-and-forget `asyncio.Task`" implementation.
- **A real bug caught by this phase's own integration test:** the first version had the background streaming task close over the request-scoped DB session/Redis client/`ModelRouter` — all torn down by FastAPI's DI as soon as the HTTP response is sent, while the background task keeps running after that. The integration test hung and logged `SAWarning: The garbage collector is trying to clean up non-checked-in connection`, direct evidence of the bug. Fixed by extracting `stream_chat_reply()` into a standalone function that builds its own `AsyncSessionLocal` session, Redis client, and `ModelRouter` — mirroring `agent_factory.execute_agent_task()` (Phase 8)'s already-established pattern for the identical problem.
- **Not built, explicitly deferred:** the desktop `ChatPanel` (message list, input, session sidebar, streaming assembly, model selector) — none of it exists yet; this is the phase's primary user-facing deliverable and the majority of its 3-week estimate. Post-session memory extraction (needs `memory_classifier.py`, same gap Phase 8's memory field is waiting on). Streaming responses don't record token usage (`StreamChunk` has no usage field, unlike `CompletionResult`).
- 33 new backend tests (317 total, up from 284): CRUD use cases, context builder (ordering, RAG inclusion, graceful degradation, history filtering), `send_message` (immediate return, chunk streaming + persistence, mid-stream failure handling), 9 integration tests against real Postgres+Redis exercising the actual streaming pipeline. `mypy app/` (123 files) and `ruff check app/ tests/` both zero-error.
- Doc fix: `phase-10-ai-chat.md` said "RAG results (Phase 16 adds RAG)" — Phase 16 is Testing, and there's no dedicated RAG phase in the 18-phase roadmap; fixed to explain RAG lives inside Phase 10 itself.

### Added — Phase 8 (Agent Framework, backend), completed 14/16 acceptance criteria (2026-08-05)

- `app/agents/base_agent.py` — `BaseAgent`: the ReAct loop (Think → Act → Observe → Reflect) plus all five guards from `AGENT_FRAMEWORK.md` §11 (30 max iterations, 50 max file writes, 20 max shell commands, 200K max tokens, 300s timeout), each breach transitioning the task to `failed` with a specific reason.
- `app/agents/agent_factory.py`, `orchestrator_agent.py`, `coder_agent.py`, `tester_agent.py`, `debugger_agent.py`, `doc_writer_agent.py`, `researcher_agent.py`, `reviewer_agent.py` — all 7 agent types from `AGENT_FRAMEWORK.md` §3. `create_agent` (`app/agents/tools/agent_tools.py`) spawns a sub-agent and publishes its result to `agent:task:{parent_task_id}:results` on Redis per §8's schema.
- `app/agents/tools/` — 13 of 19 originally-scoped tools: `read_file`/`write_file`/`patch_file`/`delete_file`/`list_directory` (`file_tools.py`), `search_files`/`grep`/`search_semantic` (`search_tools.py`), `run_command` (`shell_tools.py`), `get_git_status`/`git_diff` (`git_tools.py`), `run_tests` (`test_tools.py`), `create_agent` (`agent_tools.py`). Risk level (`registry.py`'s `@tool()` decorator, `RiskLevel` enum) is static per tool name, not computed per-call — a deliberate simplification from the roadmap's original per-call risk tiers.
- Security requirements verified by direct code inspection and dedicated tests, not just review: every file tool uses `aiofiles`/`aiofiles.os` (zero synchronous `Path.read_text()`/`.write_text()` anywhere) and validates every path through `resolve_workspace_path()`; `run_command` uses `shlex.split()` + `asyncio.create_subprocess_exec(*argv)`, never `shell=True`. Path-traversal and shell-injection tests included.
- Human approval gate (`app/agents/running_tasks.py`'s `ApprovalGate`, an `asyncio.Event`): a High-risk tool call pauses the task, emits `agent_approval_required` over WebSocket, and suspends until `POST /api/v1/agents/{id}/approve` resolves it. `approved: false` fails only that tool call (the agent re-plans) rather than cancelling the whole task, per `AGENT_FRAMEWORK.md` §6's documented design.
- `app/infrastructure/db/models/audit.py` (`AgentAuditLogModel`) + `app/infrastructure/db/repositories/audit_repository.py`, backed by new Alembic migration `0002_add_agent_audit_log` — every High-risk action gets an INSERT-only row with a real SHA-256 `before_hash`/`after_hash` of the target file's content (file tools only).
- `app/application/agents/{run_task,approve_step,cancel_task,get_task}.py` + `app/api/v1/agents.py` — `POST /agents/tasks`, `GET /agents/tasks`, `GET /agents/tasks/{id}`, `GET /agents/tasks/{id}/steps` (paginated), `POST /agents/tasks/{id}/approve`, `POST /agents/tasks/{id}/cancel`, all `CurrentUserDep`-protected with the same don't-leak-existence 404 pattern as `workspaces.py`.
- Tasks run via `asyncio.create_task()` from the API handler, not a Celery worker — no broker/worker infrastructure exists yet in this repo, and `phase-08-agent-framework.md`'s own Dependencies section asks for `asyncio`/`anyio`, not Celery.
- **Not built, both explicitly deferred (no placeholder implementations):** `browser_tools.py` (`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`) needs Phase 13's Playwright backend; `lsp_tools.py` (`get_diagnostics`) needs a real LSP client, which neither the backend nor the desktop app has yet. SSRF-prevention acceptance criterion is therefore untestable this pass, not failing.
- No desktop Agent Panel UI — out of Phase 8's own scope per the roadmap doc's file list; tracked as a `TASKS.md` follow-up.
- 103 new backend tests (284 total, up from 181): guard enforcement, all 13 tools' happy-path + security-boundary behavior, approval-gate resolve/deny, cancel, audit-log hashing, sub-agent spawn/result-collection, plus a real-Postgres+Redis integration test. `mypy app/` (115 files) and `ruff check app/ tests/` both zero-error.
- **Documentation drift found and fixed while verifying this phase:** `AGENT_FRAMEWORK.md`'s §4 tool table and code example still described tools that were never built this way (`list_files`, `git_status`, `search_codebase`, `git_stage`, `git_commit`) and a synchronous `Path.read_text()` example that contradicted the very aiofiles requirement stated two lines below it; its §5 `AgentContext` sample still listed an unimplemented `memory: AgentMemory` field; its §9 event-streaming sample showed a generic `emit(dict)` that doesn't match the real typed `EventEmitter`. `DATABASE_DESIGN.md` was missing the `agent_audit_log` table entirely (migration `0002` existed, the doc didn't). `docs/roadmap/phase-08-agent-framework.md`'s acceptance criteria for "approve with `approved: false`" and the timeout guard used wording ("cancels the task" / "is cancelled") that didn't match the actual, deliberately-designed behavior. All fixed to describe the real implementation.

### Added — Phase 9 (Model Router), completed in full (2026-08-04)

- `app/infrastructure/ai/{ollama,anthropic,openai,gemini}_provider.py` — four real `AIProvider` implementations. `GeminiProvider` uses `google-genai`, not the `google-generativeai` package named in `phase-09-model-router.md`, which reached end-of-support upstream (see its docstring). Every provider's SDK/httpx client accepts an injectable transport (same pattern as `application/auth/oauth.py`'s `OAuthCallbackUseCase`), so tests exercise real request/response parsing against `httpx.MockTransport`.
- `app/infrastructure/ai/model_router.py` — `ModelRouter`: resolves a provider from the model id, truncates messages to fit context via `context_manager.py`, retries the next model in the relevant `config/fallback_chains.yaml` chain on `ModelUnavailableError` (`complete()` can fall back at any point; `stream()` only before the first chunk is yielded, to avoid corrupting a partially-delivered transcript), caches non-streaming/non-tool responses in Redis (SHA-256 cache key, configurable TTL).
- `app/infrastructure/ai/context_manager.py` — `CONTEXT_WINDOWS` table + truncation algorithm (preserve system + last user message, drop oldest middle messages, insert a `[Context truncated]` marker).
- `app/infrastructure/ai/tokenizer_registry.py` — Ollama-model-family → Hugging Face tokenizer mapping (`Tokenizer.from_pretrained`, cached per-process) with a `tiktoken` `cl100k_base` fallback for unmapped families or failed fetches. Verified live: a real Hugging Face fetch of Qwen's tokenizer succeeded in this environment.
- `app/infrastructure/ai/embedding_service.py` — `EmbeddingService.embed()`: full batch in one provider call (never one-at-a-time), with its own `embedding` fallback chain.
- `app/infrastructure/ai/availability_checker.py` — `ProviderAvailabilityChecker`: background task (started in `core/events.py`'s `on_startup`), pings every provider's `is_available()` every 60s, writes `provider:available:{name}` to Redis (120s TTL); a provider whose check raises is recorded unavailable instead of crashing the loop.
- `app/infrastructure/ai/providers.py` — `build_providers()`/`close_providers()` + a module-level `ai_providers` singleton (same "built once, long-lived connection pool" convention as `infrastructure/cache/redis_client.py`'s `redis_pool`).
- `app/api/v1/models.py` — `GET /models` (list, with live Redis availability flags), `GET /models/{model_id}` (404 for unknown), both `CurrentUserDep`-protected. `core/dependencies.py` gained `get_model_router()`/`get_embedding_service()` (`ModelRouterDep`/`EmbeddingServiceDep`).
- `config/fallback_chains.yaml` — `chat`/`completion`/`agent`/`embedding` chains per `MODEL_ROUTER.md` §9.
- `app/core/errors.py` gained `ModelUnavailableError`/`ModelRateLimitError`/`ContextWindowExceededError`/`ProviderAuthError`, all under the existing `AIError` base.
- **Real design gap #1, fixed before it shipped:** `google-generativeai` is end-of-support; swapped for `google-genai`.
- **Real design gap #2, caught by tests:** `resolve_provider_name()`'s prefix rules couldn't resolve either model in the `embedding` fallback chain (`nomic-embed-text` has no colon; `text-embedding-3-small` starts with neither `gpt` nor `o`) — fixed with an explicit override table, `MODEL_ROUTER.md` §5 updated to match.
- `AIProvider.embed()`'s port signature widened from single-text to batched (`embed(texts: list[str], model: str) -> list[list[float]]`) — nothing implemented it yet, so a same-session correction, not a breaking change; `MODEL_ROUTER.md` §3–4 updated to match.
- New dependencies: `anthropic`, `openai`, `google-genai`, `tokenizers`, `tiktoken`, `pyyaml` (+ `types-pyyaml` dev).
- 84 new backend tests (181 total): provider parsing/error-mapping/streaming (mocked HTTP), `ModelRouter` resolution/fallback/caching/streaming, `EmbeddingService` batching/fallback, `context_manager` truncation, `tokenizer_registry`, `ProviderAvailabilityChecker`, and 7 integration tests for `GET /models` against real Postgres+Redis testcontainers. `mypy app/` and `ruff check app/ tests/` both zero-error.

### Added — Desktop login/register UI (2026-08-04, closes the Phase 7 chain)

- `src/features/auth/AuthDialog.tsx`: login/register mode toggle, email/password(+name) fields, error display, loading state. On success, calls `GET /auth/me` to fetch canonical profile and stores both the access token and user in `auth-slice.ts` via a new `setSession()` action (replacing the earlier placeholder `setAccessToken()`).
- `src/services/auth-client.ts`: `login()`/`register()`/`getCurrentUser()` — thin `fetch()` wrappers over the already-built `/auth/*` endpoints, parsing the standard `{"error":{"message"}}` schema on failure.
- `StatusBar` now shows `Sign In` or `Signed in as {email}` (click to open the dialog / sign out); a new `Account: Sign In` command palette entry does the same. `auth-slice.ts` gained `signOut()` (clears the session and disconnects the WebSocket).
- `authDialogOpen` open/close state added to `ui-slice.ts` (global, not local to `App.tsx` like the command palette — `StatusBar` is a sibling deep inside `IDELayout`, not a child of `App.tsx`, so it needs shared state to trigger the dialog without prop-drilling).
- **End-to-end result:** sign in → `workspace-slice.ts`'s `openFolder()` (already built) picks up the new token → syncs the workspace with the backend → connects the WebSocket. Every link in this chain is real, tested code — nothing fabricated to make the wiring "look" complete.
- **Deliberately not built:** token persistence across app restarts. Electron's `safeStorage` (OS keychain-backed) is the right tool, but it needs a new main-process IPC channel — a distinct piece of scope kept separate from "build the sign-in UI" rather than bundled in. In-memory-only for now, named explicitly in `PROGRESS.md`/`TASKS.md`, not silently accepted.
- 7 new desktop tests (70 total): 5 for `AuthDialog` (Testing Library + mocked `fetch`), 2 for `auth-slice`.

### Added — Workspace CRUD API + desktop WS wiring (2026-08-04, follow-up to Phase 7)

- `app/api/v1/workspaces.py`: `POST`/`GET /workspaces`, `GET`/`PATCH`/`DELETE /workspaces/{id}` per `API_SPECIFICATION.md` §2, all `CurrentUserDep`-protected. `POST /workspaces` is idempotent by `(user_id, root_path)` — opening an already-known folder bumps `last_opened_at` instead of creating a duplicate row. Ownership violations return 404, not 403 (don't confirm another user's workspace ID is valid).
- 5 new use cases in `app/application/workspaces/` (create/list/get/update/delete). The README's original `open_workspace`/`close_workspace`/`index_workspace`/`manage_settings` use cases, and the `/index`/`/files/*` endpoints, are explicitly deferred — they need file-watcher/Celery/RAG infrastructure that doesn't exist, or (for `/files/*`) a real design decision about overlap with the desktop app's own working local Electron IPC file access.
- `WorkspaceRepository.get_by_user_and_root_path()` (+ matching `domain/ports` Protocol method) backs the idempotent-create behavior.
- 12 new backend integration tests (97 total): idempotent create, cross-user isolation on list/get/update/delete, auth-required.
- Desktop: `workspace-slice.ts`'s `openFolder()` now calls `services/workspace-sync.ts`'s `syncWorkspaceWithBackend()` (best-effort — returns `null` on any failure, never throws) and, on success, `connectWorkspaceSocket()` — gated on `accessToken` being set. Since no desktop login UI exists yet, this is currently a no-op in practice, but the wiring itself is real, tested, and will start working the moment a login flow populates that token. 3 new desktop tests (63 total).

### Added — Phase 7 (WebSocket Gateway) — backend complete, desktop client built but not wired (2026-08-04)

- `app/api/ws/event_types.py`, `connection_manager.py`, `gateway.py`, `publisher.py` — `WS /ws/{workspace_id}` with first-message JWT auth (invalid/expired/missing → close code 4401), `ConnectionManager` (live connections keyed by `(workspace_id, user_id)` and by `workspace_id`), `RedisEventSubscriber` (background `psubscribe("ws:workspace:*")` task routing Redis pub/sub to matching WS connections), `publish_event()` helper.
- Ping/pong plus a 30s idle-receive timeout that closes stale connections.
- 7 backend integration tests against a **real running server** (`live_server` fixture: real `uvicorn.Server` + `websockets` client, one event loop) — `TestClient`'s WebSocket support runs in a separate thread/event loop that's incompatible with our async SQLAlchemy engine, confirmed by a real `RuntimeError` before switching approaches. Covers: valid/invalid/malformed auth, ping/pong, user-scoped isolation (verified via message ordering, not a timeout), shared broadcast, multi-connection fan-out for one user.
- `core/dependencies.py` refactored: `resolve_user_from_token()` extracted so HTTP (`get_current_user`) and WebSocket auth share one implementation instead of two copies.
- `core/events.py`'s Redis subscriber now builds its client from `settings.redis_url` at startup instead of the frozen module-level `redis_pool` singleton — the subscriber isn't a per-request dependency, so it isn't reachable via `dependency_overrides`; this is what actually lets tests redirect it to a testcontainer.
- Desktop: `src/services/ws-client.ts` (reconnect with exponential backoff capped at 5s, typed `on(eventType, handler)`), `src/hooks/useWebSocket.ts`, `src/store/ws-slice.ts`, `src/store/auth-slice.ts` (`accessToken` — real state, minimal). 7 new vitest tests against a fake `WebSocket` + fake timers.
- **Not wired:** `App.tsx` does not call `wsClient.connect()` on workspace open. Doing so needs a JWT (no desktop login UI exists yet — Phase 6 was backend-only) and a backend workspace UUID (no `POST /api/v1/workspaces` exists — deferred since Phase 4). Wiring it today would mean fabricating one or both. All the client-side plumbing is built and tested, ready for when both exist.
- **Not test-verified:** the 30s stale-connection idle timeout (would need a 30+ second test or an injectable timeout, neither done this pass).
- Doc fixes: `BACKEND_ARCHITECTURE.md` §6's event table gained `file_changed`/`git_status_changed` (previously only in the phase-07 roadmap doc) and a note that `index_progress` covers completion too (no separate `workspace_indexed` event).

### Added — Phase 6 (Authentication), completed in full (2026-08-04)

- `core/security.py`: JWT encode/decode (PyJWT), bcrypt hash/verify (work factor 12), AES-256-GCM encrypt/decrypt (random 12-byte IV, `base64(iv+ciphertext+tag)` storage), deterministic machine-id generator for local-first mode.
- Full token lifecycle: `POST /api/v1/auth/{register,login,refresh,logout}`, `GET /api/v1/auth/me`, `GET /api/v1/auth/oauth/{provider}` + `/callback` (GitHub + Google). Refresh rotation with reuse detection: replaying a rotated-away token revokes every session for that user, not just the replayed one.
- Wrong password and nonexistent email both return the same 401 in the same rough wall-clock time (a real bcrypt check runs against a fixed dummy hash even when no user exists) — neither leaks whether an email is registered.
- Per-route `slowapi` rate limits: login 10/min, register 5/min, refresh 20/min, OAuth callback 10/min (all per IP).
- `core/dependencies.py` gained `get_current_user()`/`get_optional_user()`; `core/middleware/auth.py` holds the pure JWT-decode logic they build on.
- 78 backend tests total (up from 41): 16 new `core/security.py` unit tests, 6 OAuth unit tests against a mocked `httpx` transport (no real network needed to verify the exchange logic), 15 new integration tests covering the full auth flow against real testcontainers Postgres.
- **Two real transaction-boundary bugs found by the test suite:** (1) `infrastructure/db/session.py`'s `get_db()` never committed — every write from every prior phase would have silently rolled back on a real request, undetected until Phase 6 first exercised a full HTTP round-trip through it. Fixed: commit on success, rollback on exception. (2) That fix then broke reuse detection — `AuthRepository.revoke()`/`revoke_all_for_user()` now commit immediately rather than waiting for the request-scoped commit, since a security revocation must survive even when the request that triggered it reports failure.
- Fixed a corrupted `alembic/env.py` (`from alembic import context` had somehow been split into `con`/`text` across two lines) discovered while wiring the auth router.
- **Not testable in this environment:** a live GitHub/Google OAuth round-trip needs a real registered OAuth app (client id/secret) — an external account/business decision outside what this session can act on unilaterally. The exchange logic itself is fully implemented and unit-tested against a mocked provider.
- Doc fixes: `AUTHENTICATION.md` §7 and `API_SPECIFICATION.md`'s WebSocket section both said query-parameter JWT auth, contradicting ADR 0005 (titled "websocket-auth-first-message") and two roadmap docs that all specify first-message auth — fixed both. `app/README.md`'s Layer Rules gained a documented exception for `core/dependencies.py` (the FastAPI DI composition root, which necessarily imports infrastructure).

### Added — Phase 4 (Backend Foundation) and Phase 5 (Database Layer), completed in full (2026-08-04)

**Phase 4 — Backend Foundation:**
- `RasikStudioError` hierarchy (`AuthError`/`WorkspaceError`/`AIError`/`StorageError`/`ValidationError`) and FastAPI exception handlers producing the standard `{"error": {code, message, request_id}}` envelope for domain errors, HTTP errors, validation errors, and unhandled exceptions.
- Rate-limit middleware (`slowapi`, in-memory, configurable via `RATE_LIMIT_DEFAULT`), returning 429 with the standard error schema.
- `get_db()`/`get_redis()` — real async SQLAlchemy engine + Redis connection pool, wired into `/health/ready` (now performs a live `SELECT 1`/`PING` instead of returning an empty stub).
- Domain layer: `User`/`Workspace`/`ChatSession`/`Message`/`AgentTask`/`AgentTaskStep` dataclasses; `AIProvider`/`VectorStore`/`Cache` Protocol interfaces (ports).
- `app/api/v1/` master router, `docker-compose.yml` gained `db` (pgvector/pgvector:pg16) and `redis` services.
- Backend tooling configured for the first time: `ruff` + `mypy` (both zero-error), `pytest` + `pytest-asyncio` + `testcontainers`. `package.json`'s `lint` script was a placeholder `echo` before this — now runs real `ruff`.
- 23 backend tests (16 unit, 7 integration against real testcontainers Postgres+Redis).
- Traced Starlette's actual middleware-ordering semantics (most-recently-`add_middleware`d ends up outermost) to get the documented `CORS → RequestLogger → RateLimiter → Router` execution order right — registration call order is the reverse of execution order.

**Phase 5 — Database Layer:**
- All 10 tables: SQLAlchemy 2.0 ORM models (`Mapped`/`mapped_column`, `to_domain()` conversions) for `users`, `workspaces`, `workspace_api_keys`, `chat_sessions`, `messages`, `agent_tasks`, `agent_task_steps` (normalized per ADR 0009 — no `steps JSONB`), `code_embeddings`, `workspace_memories`, `refresh_tokens`.
- One Alembic migration (autogenerated, then hand-corrected: added `CREATE EXTENSION IF NOT EXISTS vector` and the missing `pgvector` import that autogenerate doesn't add on its own).
- `code_embeddings.embedding`/`workspace_memories.embedding` are real `pgvector` `VECTOR(768)` columns with HNSW (`vector_cosine_ops`) indexes — confirmed via `EXPLAIN` showing an actual index scan, not just that the index exists.
- `make migrate` (new backend `Makefile`) wraps `scripts/check_migration_lock.py`, which acquires a Postgres advisory lock before running `alembic upgrade head` so concurrent CI runs / app instances can't race to apply migrations simultaneously.
- 7 repositories (generic `BaseRepository[ModelT]` + `user`/`workspace`/`chat`/`agent`/`embedding`/`memory`/`auth`), 18 integration tests against real testcontainers Postgres+pgvector — zero mocking, per the phase's own testing strategy.
- **Real bug the test suite caught, not code review:** every ORM timestamp column defaulted to `TIMESTAMP WITHOUT TIME ZONE` instead of the `TIMESTAMPTZ` `DATABASE_DESIGN.md` specifies (SQLAlchemy's default `Mapped[datetime]` mapping) — asyncpg rejected the first timezone-aware `datetime` a test tried to insert. Fixed with one `Base.type_annotation_map` entry; migration 0001 regenerated from the corrected models.
- Full migration lifecycle (`upgrade head` → `downgrade -1` → `upgrade head`) verified against real Postgres, including idempotency of a repeated `upgrade head`.

**Documentation fixes (found while implementing, not a separate pass):**
- `DATABASE_DESIGN.md` was missing `agent_task_steps` entirely (still showed `steps JSONB` on `agent_tasks`, contradicting its own referenced ADR 0009) and the whole `workspace_memories` table — both added.
- `MEMORY_SYSTEM.md`'s `workspace_memories` DDL said `workspace_id UUID NOT NULL`, contradicting its own later documented "global memories have `workspace_id = NULL`" behavior — fixed to nullable.
- `MODEL_ROUTER.md`'s provider interface example updated from an `ABC` with a union-returning `complete(..., stream: bool)` to match the actual `Protocol`-based, two-method (`complete()`/`stream()`) port that was built, with the reasoning for both changes documented inline.
- Corrected `PROGRESS.md`'s prior characterization of Phase 4 as "DB/auth/AI wiring deliberately out of scope" — the phase's own acceptance criteria require live DB/Redis health checks; that framing was a misreading, not a valid deferral.

### Added — Phase 11 (Terminal) completion pass (2026-08-04)

- OSC-0/OSC-2 tab-title updates: xterm's `onTitleChange` now drives a new `renameTerminal` store action, so a terminal tab tracks whatever's actually running in it (`vim`, `ssh user@host`, etc.) instead of staying pinned to its launch-time cwd.
- `electron-builder.config.ts` (per `DEPLOYMENT_GUIDE.md` §6.3) — `node-pty` in `asarUnpack`, verified with a real `--dir` packaging run: `pty.node`/`conpty*.node` confirmed landing under `resources/app.asar.unpacked/node_modules/node-pty/`, not inside `app.asar`. Added `electron-builder` devDependency and `package`/`build:electron`/`build:win`/`build:mac`/`build:linux`/`build:all` scripts. Win/mac signing, notarization, and real installers are explicitly deferred to Phase 15 — icon assets (`build/icon.ico`/`.icns`/`icons/*.png`) are still placeholder-only, a pre-existing gap this pass didn't fabricate around.
- `vitest.workspace.ts` — splits the desktop test suite into a `renderer` project (existing jsdom config) and a new `main` project (`environment: 'node'`, covers `electron/main/**`), both running under one `vitest run`.
- `electron/main/pty-manager.test.ts` (10 tests) and `electron/main/ipc/terminal-handlers.test.ts` (7 tests) — `PtyManager` session lifecycle and IPC input validation, both explicitly required by `docs/roadmap/phase-11-terminal.md`'s Testing Strategy and previously entirely untested. `src/store/terminal-slice.test.ts` (3 tests) covers the new `renameTerminal` reducer.
- Net effect: Phase 11 now meets 10 of its 12 documented acceptance criteria; the remaining 2 (WebGL-renderer-active confirmation, <10ms input-lag measurement) are unverifiable without a real display server, which this environment doesn't have — see `PROGRESS.md`'s Phase 11 entry.
- Approved `electron-winstaller`'s pnpm build script (`pnpm-workspace.yaml`) — a transitive `electron-builder` dependency for Windows Squirrel installers; its install step only selects an already-vendored 7-Zip binary for the current platform, no network fetch.

### Documentation — Repository Review & `PROGRESS.md` accuracy pass

- Performed a full Repository Review (all documentation, all source files, actual vs. documented deliverables) rather than trusting the prior checklist state — see the new Decisions Log entry in `PROGRESS.md`.
- Rewrote `PROGRESS.md` from a per-phase `[x]`/`[ ]` checklist format into the required `# Completed` / `# In Progress` / `# Not Started` structure, with a Repository Health matrix and Current Sprint section, per the newly adopted Progress Management Rules.
- Corrected several previously-optimistic phase statuses after verification: zero automated backend tests exist (not previously called out this explicitly); only 2 of many desktop `index.ts` barrel files exist; zero backend domain-model stub files exist; `electron-builder.config.ts` does not exist (blocks Phase 11's `node-pty` `asarUnpack` requirement); no CI/CD workflows exist at all.
- Broke Phase 11 (Terminal) out as its own explicit `# In Progress` line item (previously folded invisibly into Phase 3's notes), scored against `docs/roadmap/phase-11-terminal.md`'s 12 documented acceptance criteria: 8 met, 4 gaps identified (OSC-0 tab titles, link detection, `PtyManager` unit tests, packaging config).
- Added 8 new tracked items to `TASKS.md` reflecting these verified gaps.

### Added — File explorer context menu

- Rename (inline), Delete (behind a confirmation dialog), Copy Path, and Reveal in OS — extending the `ContextMenu` wiring the terminal work introduced (previously only "Open Terminal Here").
- New IPC: `files:move`, `files:delete`, `shell:showItemInFolder` (`electron/main/ipc/shell-handlers.ts` is new).
- Rename keeps an open tab's `id` stable (only `path`/`name` change), so its Monaco model, undo history, and view state survive the rename instead of looking like a close-and-reopen of an unrelated file.
- Deleting or renaming refreshes both the affected directory listing and quick-open's full-workspace file list — otherwise either could point at files that no longer exist at that path.

### Added — Terminal + `BottomPanel`

- Embedded terminal: xterm.js (WebGL renderer, DOM fallback) + `node-pty`, multiple tabs, `Ctrl+\`` toggle, "Open Terminal Here" from the file explorer's new right-click menu (`ContextMenu` primitive wired in for the first time).
- `PtyManager` (Electron main process) — session lifecycle, platform default-shell detection, workspace-root-validated working directories; verified with a real spawned PTY (this environment has no display, so the running window itself is still unverified).
- `terminal:{create,write,resize,kill}` IPC channels, plus `terminal:data:{id}`/`terminal:exit:{id}` event streams.
- `BottomPanel` layout region — `IDELayout` now nests a vertical resizable split (editor/terminal) inside the existing horizontal one (sidebar/main); `ResizeHandle` made direction-aware (it only handled horizontal splits before).
- Terminal code (~700KB with xterm.js and its addons) is lazy-loaded via `React.lazy`/`Suspense`, matching how Monaco is already lazy-loaded — not part of the initial bundle.

### Changed — Process / tooling

- **Adopted autonomous phase-to-phase operation** — `CLAUDE.md` updated to remove the per-phase approval pause it previously required; phases now proceed back-to-back, with repository cleanup and documentation sync required before each one. Commits are still never executed automatically (drafted only).
- Enabled `noUnusedLocals`/`noUnusedParameters` in `tsconfig.base.json` — previously, a clean `tsc --noEmit` didn't actually guarantee no unused imports.

### Added — Desktop application shell (this session)

- Design system component library: `Button`, `Tabs`, `Input`, `Tooltip`, `Dialog`, `ScrollArea`, `Badge`, `ContextMenu` (`apps/desktop/src/components/ui/`), Radix UI-backed where applicable.
- Command palette and quick-open (`Ctrl+Shift+P` / `Ctrl+P`) as one dual-mode overlay, with a `CommandRegistry` singleton and four real registered commands (Open Folder, Save File, Close Tab, Toggle Theme).
- Fuzzy subsequence matching (`src/lib/fuzzy-match.ts`) powering both file search and command filtering.
- Dark/light theme switching — `settings-slice`, `useTheme` hook, `localStorage` persistence, applied synchronously before first paint to avoid a flash of the wrong theme; Monaco's own theme now follows the app theme.
- Recursive workspace-wide file listing (`files:listAll` IPC channel, capped at 5000 files, excludes `node_modules`/`.git`/build output) to give quick-open a real search space beyond already-open tabs.
- Vitest test infrastructure (`vitest.config.ts`, jsdom, Testing Library) — did not exist previously. 24 unit tests covering `fuzzy-match`, `CommandRegistry`, and (retroactively) `Button`/`Tabs`.
- `useKeyBinding` hook for global keyboard shortcuts.

### Added — Backend foundation

- `Settings` (pydantic-settings), structured logging (`structlog`, JSON or console renderer), request-ID middleware (`X-Request-ID` header + structured log line per request), CORS middleware.
- Health endpoints: `GET /health`, `/health/live`, `/health/ready` (mounted unversioned, per `BACKEND_ARCHITECTURE.md` §12).
- `apps/backend/.env.example`.

### Added — Desktop IDE shell (earlier this session)

- Electron main/preload with `contextIsolation: true`, `nodeIntegration: false`.
- IDE layout: `ActivityBar`, resizable `LeftSidebar`, `EditorArea`, `StatusBar` (`react-resizable-panels`).
- Monaco Editor integration — lazy-loaded, web workers configured, one editor instance reused across files via `setModel()`.
- File explorer with lazy-expand tree, backed by real file IPC (`files:read`/`write`/`list`), with workspace-root path-traversal validation on every file operation.
- Editor tabs with dirty-state tracking and `Ctrl+S` save.
- Zustand + Immer store (`workspace-slice`, `editor-slice`, `ui-slice`, later `settings-slice`).

### Added — Monorepo bootstrap

- pnpm workspace + Turborepo orchestration (`turbo.json`, root `package.json`).
- `apps/desktop` (Electron + React + Vite via `electron-vite`) and `apps/backend` (FastAPI, managed with `uv`) scaffolds.
- Root ESLint (flat config) + Prettier; backend Dockerfile.
- Git repository initialized.

### Fixed

- Monaco editor did not preserve cursor position or scroll offset when switching between open file tabs (`setModel()` alone doesn't do this) — now saves/restores per-file view state via `editor.saveViewState()`/`restoreViewState()`.
- A duplicated `basename()` helper existed identically in both `workspace-slice.ts` and `editor-slice.ts` — extracted to `src/lib/path-utils.ts`.
- `resolveWorkspacePath()` (backend `SECURITY_GUIDELINES.md` reference implementation) rejected the workspace root itself when listing it — fixed to allow exactly the root while still rejecting everything outside it.

### Documentation

- Reviewed and reorganized all project markdown documentation for consistency; expanded `README.md` into a categorized index; split `IMPLEMENTATION_ROADMAP.md` into `docs/roadmap/` (one file per phase).
- Repository structure audit and migration proposal (`docs/reports/2026-08-03-repository-structure-audit.md`) — analysis only, not yet acted on.
- Resolved a real contradiction between `TESTING_STRATEGY.md` (co-located desktop tests) and four other docs (a separate mirrored `tests/unit/` tree) in favor of co-location — see the Decisions Log in `PROGRESS.md`. Removed the stale, empty `apps/desktop/tests/unit/` scaffold and fixed every doc that described it (`FOLDER_STRUCTURE.md`, `PROJECT_STRUCTURE.md`, `docs/roadmap/phase-16-testing.md`, `apps/desktop/README.md`, `apps/desktop/tests/README.md`).
- Fixed stale `concurrently`-based examples in `DEPLOYMENT_GUIDE.md` and `docs/roadmap/phase-03-desktop-application-shell.md` to match the actual Turborepo-based setup; corrected `phase-03`'s dependency list to what was actually installed.
