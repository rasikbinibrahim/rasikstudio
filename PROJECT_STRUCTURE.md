# Project Structure — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03
**Status:** Reference document — describes packages, folders, modules, services, and interfaces as designed. **No implementation exists yet** (see `PROGRESS.md`). Every file named below is a planned file, not a built one.

---

## 0. How to Read This Document

This is the single place that answers "what lives where, and what does it do" for the entire repository, at every level of granularity:

- **Package** — a deployable app or a shared library in the monorepo.
- **Folder** — a directory and its role in the architecture.
- **Module** — a planned source file and its one-line responsibility.
- **Service** — a class/object that encapsulates a piece of behavior (a use case, a repository, a provider, a client).
- **Interface** — an abstract contract (Python `Protocol`/ABC, TypeScript `interface`, or a wire format like a WebSocket event or REST endpoint) that a module must satisfy.

No code bodies are reproduced here — only signatures and responsibilities. For rationale and full design detail, follow the "See" links to the root-level architecture docs. For per-folder rules (what may/may not go in a directory), see the `README.md` inside that directory — this document summarizes them but the local `README.md` is authoritative for folder-specific rules.

---

## 1. Monorepo Packages

| Package | Path | Kind | Language | Purpose |
|---|---|---|---|---|
| **desktop** | `apps/desktop/` | Electron application | TypeScript / React | The IDE itself — editor, panels, terminal, chat, agent UI |
| **backend** | `apps/backend/` | FastAPI service | Python 3.12 | AI inference, agent orchestration, persistence, RAG, auth |
| **desktop-types** | `packages/desktop-types/` | Generated library | TypeScript | Types generated from the backend's OpenAPI schema; the only shared package (ADR 0007) |

Rules governing package boundaries (`apps/README.md`, `packages/README.md`):
- `apps/desktop` and `apps/backend` never import each other's source — they talk only over HTTP and WebSocket.
- Shared code that both apps need is a candidate for `packages/`, but the bar is high — most code belongs in the app that uses it. Today only generated types are shared.

---

## 2. Full Directory Tree

`FOLDER_STRUCTURE.md` is the single authoritative copy of the full directory tree, with a link to the `README.md` in every folder. This document does not repeat it — the sections below instead walk through *what each module in that tree does*, organized the same way: backend by Clean Architecture layer (§3), desktop by process (§4).

---

## 3. Backend — `apps/backend/`

Clean Architecture with a strict import direction:

```
api/ → application/ → domain/ ←── infrastructure/
agents/ → domain/, infrastructure/, core/
core/ → (nothing outside core/)
domain/ → (nothing — pure Python)
```

### 3.1 `app/api/` — Transport layer (HTTP + WebSocket, no business logic)

**`app/api/v1/`** — REST routers, one file per domain, all mounted under `/api/v1`:

| Module | Route Prefix | Backing Use Cases |
|---|---|---|
| `health.py` | `/health`, `/health/ready`, `/health/live` | — |
| `auth.py` | `/auth` | `RegisterUseCase`, `LoginUseCase`, `RefreshTokenUseCase`, `LogoutUseCase`, `OAuthCallbackUseCase` |
| `workspaces.py` | `/workspaces` | `CreateWorkspaceUseCase`, `OpenWorkspaceUseCase`, `IndexWorkspaceUseCase`, `ManageWorkspaceSettingsUseCase` |
| `files.py` | `/workspaces/{id}/files` | `path_validator` domain service + direct FS I/O |
| `chat.py` | `/chat` | `CreateChatSessionUseCase`, `SendMessageUseCase`, `ManageSessionUseCase` |
| `agents.py` | `/agents` | `RunAgentTaskUseCase`, `ApproveAgentStepUseCase`, `CancelAgentTaskUseCase`, `GetAgentTaskUseCase` |
| `git.py` | `/workspaces/{id}/git` | `git_tool.py` (infrastructure) |
| `models.py` | `/models` | `ModelRouter.list_available()` |
| `search.py` | `/search` | `SemanticSearchUseCase`, grep tool |
| `settings.py` | `/settings` | `ManageWorkspaceSettingsUseCase` |
| `__init__.py` | — | Master `APIRouter` aggregating all of the above |

**`app/api/ws/`** — WebSocket gateway:

| Module | Responsibility |
|---|---|
| `gateway.py` | `WS /ws/{workspace_id}` endpoint — connection lifecycle, first-message auth |
| `connection_manager.py` | **`ConnectionManager`** service — tracks live connections keyed by `(workspace_id, user_id)` |
| `event_types.py` | Pydantic discriminated union — the WebSocket **event interface** (§8.4) |
| `publisher.py` | `publish_event()` — services call this to fan events out via Redis pub/sub |

### 3.2 `app/agents/` — Agent orchestration (outside the strict layers by design)

| Module | Class | Role |
|---|---|---|
| `base_agent.py` | **`BaseAgent`** (abstract) | ReAct loop (Think → Act → Observe → Reflect), guard enforcement |
| `orchestrator_agent.py` | `OrchestratorAgent` | Decomposes tasks, spawns sub-agents, synthesizes results |
| `coder_agent.py` | `CoderAgent` | Reads/writes code |
| `tester_agent.py` | `TesterAgent` | Writes and runs tests |
| `debugger_agent.py` | `DebuggerAgent` | Analyzes errors and traces |
| `doc_writer_agent.py` | `DocWriterAgent` | Writes documentation |
| `researcher_agent.py` | `ResearcherAgent` | Searches codebase and web |
| `reviewer_agent.py` | `ReviewerAgent` | Reviews code for quality and security |
| `agent_factory.py` | `create_agent(type: str) -> BaseAgent` | Factory — resolves agent type string to a class |

Every agent operates on an **`AgentContext`** (§8.2) and is bound by guards: max 30 iterations, 50 file writes, 20 shell commands, 200K tokens, 300s timeout. See `AGENT_FRAMEWORK.md`.

**`app/agents/tools/`** — every capability an agent can invoke, registered via `@tool()`:

| Module | Tools | Risk |
|---|---|---|
| `registry.py` | `ToolRegistry`, `@tool()` decorator, `RiskLevel` enum | — |
| `file_tools.py` | `read_file`, `write_file`, `patch_file`, `delete_file`, `list_directory`, `create_directory`, `move_file` | Low → High |
| `search_tools.py` | `search_files` (grep), `search_semantic` (RAG) | Low |
| `shell_tools.py` | `run_command` | High |
| `git_tools.py` | `get_git_status`, `git_diff`, `git_stage`, `git_commit` | Low → Medium |
| `browser_tools.py` | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_get_text` | Medium → High |
| `test_tools.py` | `run_tests` | Medium |
| `agent_tools.py` | `create_sub_agent` | High |
| `lsp_tools.py` | `get_diagnostics` | Low |

Coverage target for this directory: 90% (highest in the codebase — file system and process access).

### 3.3 `app/application/` — Use cases (one file = one business workflow)

| Subdomain | Use Case Modules |
|---|---|
| `auth/` | `register.py` → `RegisterUseCase`; `login.py` → `LoginUseCase`; `refresh.py` → `RefreshTokenUseCase`; `logout.py` → `LogoutUseCase`; `oauth.py` → `OAuthCallbackUseCase` |
| `chat/` | `create_session.py` → `CreateChatSessionUseCase`; `send_message.py` → `SendMessageUseCase`; `context_builder.py` → `ContextBuilder` (service, not a use case — stateless); `manage_session.py` → `ManageSessionUseCase`; `memory_extractor.py` → `MemoryExtractorUseCase` |
| `agents/` | `run_task.py` → `RunAgentTaskUseCase`; `approve_step.py` → `ApproveAgentStepUseCase`; `cancel_task.py` → `CancelAgentTaskUseCase`; `get_task.py` → `GetAgentTaskUseCase` |
| `workspaces/` | `create_workspace.py`, `open_workspace.py`, `close_workspace.py`, `index_workspace.py`, `manage_settings.py` — each `→ *UseCase` |
| `rag/` | `index_file.py` → `IndexFileUseCase`; `search_semantic.py` → `SemanticSearchUseCase`; `delete_file_index.py` → `DeleteFileIndexUseCase`; `incremental_check.py` → `IncrementalIndexCheckUseCase` |
| `memory/` | `extract_memories.py` → `ExtractMemoriesUseCase`; `retrieve_memories.py` → `RetrieveMemoriesUseCase`; `prune_memories.py` → `PruneMemoriesUseCase` |

Use cases depend only on **ports** (§3.4) — never on concrete infrastructure classes — so they can be unit-tested with fakes.

### 3.4 `app/domain/` — Pure Python: models, ports (interfaces), and domain services

**`domain/models/`** — plain dataclasses, no ORM/Pydantic coupling:

| Module | Entities |
|---|---|
| `user.py` | `User` |
| `workspace.py` | `Workspace` |
| `chat.py` | `ChatSession`, `Message` |
| `agent.py` | `AgentTask`, `AgentStep` |
| `embedding.py` | `CodeEmbedding` |
| `memory.py` | `WorkspaceMemory` |

**`domain/ports/`** — the interface layer (Python `Protocol` classes, structural typing — no inheritance needed to satisfy them):

| Interface | Defines | Implemented By |
|---|---|---|
| `UserRepository` | user CRUD, lookup by email | `infrastructure/db/repositories/user_repository.py` |
| `WorkspaceRepository` | workspace CRUD, list by user | `infrastructure/db/repositories/workspace_repository.py` |
| `ChatRepository` | session CRUD, message append/history | `infrastructure/db/repositories/chat_repository.py` |
| `AgentRepository` | task CRUD, step append, status update | `infrastructure/db/repositories/agent_repository.py` |
| `AIProvider` (`ModelProvider`) | `complete()`, `embed()`, `is_available()`, `count_tokens()` — full signature in §8.1 | `infrastructure/ai/{ollama,anthropic,openai,gemini}_provider.py` |
| `VectorStore` | upsert, cosine search, delete-by-path | `infrastructure/vector/pgvector_store.py` |
| `Cache` | get/set/delete with TTL | `infrastructure/cache/cache_service.py` |
| `EventPublisher` | publish an event to the WebSocket fan-out | `api/ws/publisher.py` |

**`domain/services/`** — pure logic, no I/O, no mocking required to test:

| Module | Purpose |
|---|---|
| `context_builder.py` | Assembles the ordered AI context array (system → workspace → RAG → history → user message) |
| `token_counter.py` | Counts tokens per model family's tokenizer |
| `message_compressor.py` | Compresses history when nearing the context window limit |
| `path_validator.py` | `resolve_workspace_path()` — the single choke point that prevents path traversal |
| `memory_classifier.py` | Classifies extracted text into a memory type (architecture/convention/bug/dependency/location/environment) |

### 3.5 `app/infrastructure/` — Concrete implementations of the ports above

| Directory | External System | Key Modules |
|---|---|---|
| `ai/` | Ollama, Anthropic, OpenAI, Gemini | `base_provider.py` (Protocol + `StreamChunk`/`TokenUsage`), `ollama_provider.py`, `anthropic_provider.py`, `openai_provider.py`, `gemini_provider.py`, `model_router.py` (**`ModelRouter`** service, §8.1), `context_manager.py`, `embedding_service.py` (**`EmbeddingService`**, batched) |
| `browser/` | Playwright | `playwright_service.py` (**`PlaywrightBrowserService`**), `ssrf_guard.py` |
| `cache/` | Redis | `redis_client.py`, `cache_service.py` (**`CacheService`**), `rate_limiter.py` |
| `db/` | PostgreSQL / SQLAlchemy | `session.py` (engine + `get_db()`); `models/` — ORM classes (`base.py`, `user.py`, `workspace.py`, `chat.py`, `agent.py`, `embedding.py`, `auth.py`, `audit.py`); `repositories/` — port implementations (`base.py` generic `BaseRepository[T]`, plus one file per port above, `audit_repository.py`) |
| `vector/` | PostgreSQL + pgvector | `pgvector_store.py` (**`PgVectorStore`**), `hnsw_config.py` |

### 3.6 `app/core/` — Cross-cutting concerns (imports nothing else in the app)

| Module | Purpose |
|---|---|
| `config.py` | **`Settings`** (pydantic-settings) — all environment variables |
| `security.py` | JWT encode/decode, bcrypt hash/verify, AES-256-GCM encrypt/decrypt |
| `logging.py` | structlog configuration, request-ID injection |
| `errors.py` | `RasikStudioError` hierarchy (§8.5) + FastAPI exception handlers |
| `events.py` | `startup()` / `shutdown()` lifecycle hooks |
| `dependencies.py` | `get_db()`, `get_redis()`, `get_current_user()` — FastAPI `Depends()` providers |
| `middleware/` | `cors.py`, `request_logger.py`, `auth.py`, `rate_limiter.py` — applied in that order |

### 3.7 Supporting directories

| Directory | Contents |
|---|---|
| `alembic/` | `env.py` (async migration environment), `versions/` (one file per schema change) |
| `config/` | `fallback_chains.yaml`, `rate_limits.yaml`, `agent_guards.yaml` — non-secret YAML read at startup |
| `scripts/` | `create_superuser.py`, `rebuild_rag_index.py`, `prune_old_memories.py`, `check_migration_lock.py`, `export_workspace_data.py` — standalone admin scripts |
| `tests/unit/` | Mirrors `app/` 1:1, no I/O, fakes/mocks for ports |
| `tests/integration/` | Mirrors `app/`, runs against real PostgreSQL + Redis via `testcontainers` |

---

## 4. Desktop — `apps/desktop/`

Two processes joined by a single security boundary:

```
Electron Main (Node.js, full OS access) ── contextBridge (electron/preload/) ── Renderer (React, sandboxed)
```

### 4.1 `electron/` — Main process (Node.js)

**`electron/main/`**

| Module | Responsibility |
|---|---|
| `index.ts` | App entry — `app.whenReady()`, lifecycle hooks |
| `window-manager.ts` | **`WindowManager`** — creates/tracks/destroys `BrowserWindow` instances |
| `file-system-service.ts` | Async file read/write/list/watch |
| `lsp-manager.ts` | Language server process lifecycle |
| `git-service.ts` | **`GitService`** — Git CLI subprocess wrapper (§8.6) |
| `pty-manager.ts` | **`PtyManager`** — node-pty session lifecycle (§8.7) |
| `docker-service.ts` | Docker CLI subprocess wrapper |
| `ipc-registry.ts` | Registers every `ipcMain.handle()` from `ipc/` |

**`electron/main/ipc/`** — one file per domain, each validating input before acting:

| Module | Channel Prefix |
|---|---|
| `file-handlers.ts` | `files:*` |
| `terminal-handlers.ts` | `terminal:*` |
| `git-handlers.ts` | `git:*` |
| `docker-handlers.ts` | `docker:*` |
| `browser-handlers.ts` | `browser:*` |
| `settings-handlers.ts` | `settings:*` |
| `shell-handlers.ts` | `shell:*` |

**`electron/preload/`** — the *only* code that touches both Node.js and the renderer:

| Module | Purpose |
|---|---|
| `index.ts` | Calls `contextBridge.exposeInMainWorld('rasik', ...)` |
| `api.ts` | Typed definition of the `window.rasik.*` **interface** (§8.7) |

**`electron/services/`** — long-lived, non-IPC main-process services:

| Module | Service |
|---|---|
| `auto-updater.ts` | `AutoUpdaterService` |
| `app-menu.ts` | `AppMenuService` |
| `protocol-handler.ts` | `ProtocolHandlerService` |
| `tray-manager.ts` | `TrayManager` (future) |

### 4.2 `src/` — Renderer process (React, `contextIsolation: true`, `nodeIntegration: false`)

**`src/components/ui/`** — design system primitives (stateless, theme-token-only, WCAG 2.1 AA):

| Component | Variants |
|---|---|
| `Button.tsx` | `primary`/`secondary`/`ghost`/`danger` × `sm`/`md`/`lg` |
| `Input.tsx` | prefix/suffix slots |
| `Tooltip.tsx` | `top`/`bottom`/`left`/`right` |
| `Dialog.tsx` | `sm`/`md`/`lg`/`full` |
| `ScrollArea.tsx` | — |
| `Tabs.tsx` | closeable |
| `Badge.tsx` | `default`/`error` |
| `ContextMenu.tsx` | — |

**`src/features/`** — self-contained, mutually non-importing feature modules:

| Feature | Key Modules | Hook |
|---|---|---|
| `editor/` | `MonacoEditor.tsx`, `EditorTabBar.tsx`, `EditorTab.tsx`, `DiffViewer.tsx`, `lsp-client.ts`, `language-config.ts` | `useMonaco.ts` |
| `file-explorer/` | `FileExplorer.tsx`, `FileTree.tsx` (virtualized), `FileTreeNode.tsx`, `FileContextMenu.tsx`, `file-icons.ts` | `useFileTree.ts` |
| `command-palette/` | `CommandPalette.tsx`, `CommandRegistry.ts` (singleton), `command-types.ts` | `useCommandPalette.ts` |
| `chat/` | `ChatPanel.tsx`, `ChatSessionList.tsx`, `ChatMessageList.tsx`, `ChatMessage.tsx`, `StreamingMessage.tsx`, `ChatInput.tsx`, `ModelSelector.tsx`, `ContextFileChip.tsx` | `useChat.ts` |
| `terminal/` | `TerminalPanel.tsx`, `TerminalTabBar.tsx`, `TerminalTab.tsx` | `useTerminal.ts` |
| `git/` | `GitPanel.tsx`, `GitStatusSection.tsx`, `GitFileItem.tsx`, `CommitPanel.tsx`, `ConflictResolver.tsx`, `BranchSelector.tsx` | `useGit.ts` |
| `browser/` | `BrowserPanel.tsx`, `AddressBar.tsx`, `BrowserToolbar.tsx`, `AgentBrowserOverlay.tsx` | `useBrowser.ts` |
| `docker/` | `DockerPanel.tsx`, `ContainerList.tsx`, `ContainerItem.tsx`, `ContainerLogs.tsx` | `useDocker.ts` |
| `agent/` | `AgentPanel.tsx`, `AgentTaskList.tsx`, `AgentTaskDetail.tsx`, `AgentStep.tsx`, `AgentApprovalGate.tsx`, `AgentBrowserView.tsx`, `NewTaskDialog.tsx` | `useAgent.ts` |
| `search/` | `SearchPanel.tsx`, `SearchInput.tsx`, `SearchResults.tsx`, `SearchResultFile.tsx`, `SearchResultLine.tsx` | `useSearch.ts` |
| `settings/` | `SettingsPanel.tsx`, `SettingsCategory.tsx`, `SettingRow.tsx`, `KeybindingsEditor.tsx`, `ThemePicker.tsx` | `useSettings.ts` |
| `extensions/` | `ExtensionsPanel.tsx`, `PluginCard.tsx`, `InstalledPlugins.tsx`, `PluginDetailView.tsx` (post-v1.0) | `useExtensions.ts` |

**`src/hooks/`** (shared across ≥2 features): `useIpc.ts`, `useWebSocket.ts`, `useWorkspace.ts`, `useSettings.ts`, `useTheme.ts`, `useKeyBinding.ts`, `useDebounce.ts`.

**`src/layout/`** (IDE chrome, no business state): `IDELayout.tsx`, `ActivityBar.tsx`, `LeftSidebar.tsx`, `RightSidebar.tsx`, `EditorArea.tsx`, `BottomPanel.tsx`, `StatusBar.tsx`, `ResizablePanel.tsx`, `PanelTab.tsx`.

**`src/lib/`** (zero React, zero side effects): `path-utils.ts`, `file-type.ts`, `format.ts`, `text.ts`, `cn.ts`.

**`src/services/`** — the three ways the renderer talks to the outside world:

| Module | Interface | Purpose |
|---|---|---|
| `api-client.ts` | HTTP client | Typed wrapper over `/api/v1/*` |
| `ws-client.ts` | **`WSClient`** (§8.4) | Singleton WebSocket connection, one per workspace |
| `ipc-bridge.ts` | thin wrapper | Maps to `window.rasik.*` |

**`src/store/`** — one Zustand slice per domain: `workspace-slice.ts`, `editor-slice.ts`, `chat-slice.ts`, `agent-slice.ts`, `terminal-slice.ts`, `git-slice.ts`, `docker-slice.ts`, `ui-slice.ts`, `settings-slice.ts`, `ws-slice.ts`, composed in `index.ts`.

**`src/styles/`**: `global.css` (token definitions), `editor.css`, `terminal.css`; **`styles/themes/`**: `rasik-dark.json`, `rasik-light.json`, `high-contrast-dark.json`, `high-contrast-light.json`.

**`src/types/`**: `ipc.ts`, `ws-events.ts`, `workspace.ts`, `ai.ts`, `agent.ts`, `git.ts`, `theme.ts`, `global.d.ts` — desktop-only types; API-shaped types come from `packages/desktop-types` instead.

### 4.3 Supporting directories

| Directory | Contents |
|---|---|
| `build/` | electron-builder static assets: `icons/` (per-platform), entitlements |
| `tests/e2e/` | 8 critical-flow Playwright specs + `fixtures/` (sample workspaces, mock backend) |
| `tests/unit/` | Vitest, mirrors `src/` 1:1 |

---

## 5. `packages/desktop-types/`

One file, machine-generated, never hand-edited: `src/api.d.ts` — every request/response schema, error type, and enum from the FastAPI OpenAPI schema, regenerated by `make generate-types` after any backend API change and committed so CI can detect drift without running the backend.

---

## 6. `docs/`

| Directory | Contents |
|---|---|
| `adr/` | 10 planned ADRs (`0001`–`0010`), e.g. Electron vs. Tauri, FastAPI choice, pgvector, Celery over arq for background tasks, WebSocket first-message auth, unified streaming, OpenAPI-generated types (ADR 0007), Git CLI vs. libgit2 (ADR 0008), normalized agent steps table, nomic-embed-text 768d |
| `api/` | Human-readable REST/WebSocket/error-code reference, generated alongside the OpenAPI schema |
| `plugin-authoring/` | Plugin SDK guide, manifest reference, permissions, sandbox model, `examples/` (4 runnable sample plugins) |
| `reference/` | 11-dimension analyses of the 9 studied projects: `vscodium/`, `cline/`, `openhands/`, `continue/`, `ollama/`, `monaco/`, `playwright/`, `xterm/`, `libgit2/` |
| `user-guide/` | End-user docs: installation, getting started, AI features, git, terminal, browser, settings, shortcuts, themes, plugins, troubleshooting |

---

## 7. Services Reference (Consolidated)

A "service" here is any class that owns a piece of runtime behavior, as opposed to a stateless function or a data model.

### 7.1 Backend services

| Service | Module | Responsibility |
|---|---|---|
| `ModelRouter` | `infrastructure/ai/model_router.py` | Resolves model ID → provider, applies fallback chain, truncation, caching |
| `EmbeddingService` | `infrastructure/ai/embedding_service.py` | Batched embedding calls |
| `PlaywrightBrowserService` | `infrastructure/browser/playwright_service.py` | Headless browser lifecycle for agent tools |
| `CacheService` | `infrastructure/cache/cache_service.py` | Typed Redis get/set/delete with TTL |
| `PgVectorStore` | `infrastructure/vector/pgvector_store.py` | Embedding upsert/search/delete |
| `ConnectionManager` | `api/ws/connection_manager.py` | Tracks live WebSocket connections per workspace/user |
| `ToolRegistry` | `agents/tools/registry.py` | Holds every `@tool()`-decorated function and its schema |
| `ContextBuilder` | `application/chat/context_builder.py` / `domain/services/context_builder.py` | Assembles the AI context array |
| Every `*UseCase` in §3.3 | `application/**` | One workflow each — the primary backend "services" from the API's point of view |

### 7.2 Desktop services

| Service | Module | Responsibility |
|---|---|---|
| `WindowManager` | `electron/main/window-manager.ts` | BrowserWindow lifecycle |
| `PtyManager` | `electron/main/pty-manager.ts` | node-pty session lifecycle |
| `GitService` | `electron/main/git-service.ts` | Git CLI subprocess wrapper |
| `AutoUpdaterService` | `electron/services/auto-updater.ts` | electron-updater lifecycle |
| `AppMenuService` | `electron/services/app-menu.ts` | Native menu bar + command routing |
| `WSClient` | `src/services/ws-client.ts` | Singleton WebSocket connection + typed event dispatch |
| `api-client` | `src/services/api-client.ts` | Typed REST client |
| `ipc-bridge` | `src/services/ipc-bridge.ts` | Typed wrapper over `window.rasik.*` |
| `CommandRegistry` | `src/features/command-palette/CommandRegistry.ts` | Singleton command registration/dispatch used by features and plugins |

---

## 8. Interfaces Reference (Consolidated)

### 8.1 `ModelProvider` (AI provider abstraction)

Implemented identically by `OllamaProvider`, `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`; consumed only through `ModelRouter`.

```
ModelProvider (ABC)
  complete(messages, model, temperature=0.7, max_tokens=4096, tools=None, stream=False)
      -> CompletionResult | AsyncIterator[StreamChunk]
  embed(text, model) -> list[float]
  is_available() -> bool
  count_tokens(messages, model) -> int
```

Supporting data schemas: `Message`, `Tool`, `ToolCall`, `StreamChunk`, `CompletionResult`, `TokenUsage`. See `MODEL_ROUTER.md §3–4`.

### 8.2 `AgentContext`

Passed to every tool invocation:

```
AgentContext
  task_id, workspace_id, workspace_root, user_id, model
  event_emitter: EventEmitter
  memory: AgentMemory
  require_approval: bool
  approved_actions: set[str]
```

See `AGENT_FRAMEWORK.md §5`.

### 8.3 Domain ports (`app/domain/ports/`)

See table in §3.4. All are Python `Protocol` classes — structural typing, no forced inheritance, trivially fakeable in unit tests.

### 8.4 WebSocket event schema

Single channel per connection: `WS /ws/{workspace_id}?token={jwt}`. Server → client events (discriminated union in `api/ws/event_types.py`):

| Event | Payload |
|---|---|
| `stream_start` / `stream_chunk` / `stream_end` | `{message_id, delta?, finish_reason?, usage?}` |
| `tool_call` / `tool_result` | `{message_id, tool, args/result}` |
| `agent_started` / `agent_step` / `agent_approval_required` / `agent_completed` / `agent_failed` | `{task_id, ...}` |
| `index_progress` | `{workspace_id, files_done, files_total, current_file}` |
| `browser_screenshot` | `{task_id, image (base64 PNG)}` |

Client → server: `{"type": "ping"}`, `{"type": "agent_approve", "task_id", "approved"}`.

Frontend consumption contract (`src/services/ws-client.ts`):

```
WSClient
  connect(workspaceId): void
  disconnect(): void
  on<T>(eventType, handler): () => void   // returns unsubscribe
  off(eventType, handler): void
```

### 8.5 Backend error hierarchy

```
RasikStudioError
├── AuthError → InvalidCredentialsError, TokenExpiredError
├── WorkspaceError → WorkspaceNotFoundError, WorkspaceAccessDeniedError
├── AIError → ModelUnavailableError, ContextWindowExceededError, ToolExecutionError
└── StorageError → FileNotFoundError, FileWriteError
```

Every subtype maps to an HTTP status via the global exception handler; all error responses share the shape `{"error": {"code", "message", "request_id"}}`.

### 8.6 REST API surface (see `API_SPECIFICATION.md` for full request/response bodies)

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/{register,login,refresh,logout}`, `GET /auth/oauth/{provider}[/callback]`, `GET /auth/me` |
| Workspaces | `GET/POST /workspaces`, `GET/PATCH/DELETE /workspaces/{id}`, `POST /workspaces/{id}/index` |
| Files | `GET /workspaces/{id}/files[/content]`, `PUT .../content`, `DELETE .../files`, `POST .../files/move` |
| Chat | `GET/POST /chat/sessions`, `GET/PATCH/DELETE /chat/sessions/{id}`, `GET/POST .../messages` (SSE stream) |
| Agents | `GET/POST /agents/tasks`, `GET /agents/tasks/{id}`, `POST .../approve`, `POST .../cancel` |
| Git | `GET .../git/status`, `POST .../git/{stage,unstage,commit,checkout,generate-commit-message}`, `GET .../git/{log,diff,branches}` |
| Search | `POST /search/semantic`, `POST /search/grep` |
| Models | `GET /models`, `GET /models/{id}/info` |
| Settings | `GET/PATCH /settings`, `POST/DELETE /settings/api-keys[/{provider}]` |
| WebSocket | `WS /ws/{workspace_id}?token={jwt}` |

### 8.7 IPC surface (`window.rasik.*`, defined in `electron/preload/api.ts`)

```
window.rasik.files.{read,write,list,watch}
window.rasik.terminal.{create,write,resize,kill,onData}
window.rasik.git.{status,commit,...}
window.rasik.docker.*
window.rasik.browser.*
window.rasik.settings.{get,set}
window.rasik.shell.{openExternal,showItemInFolder}
window.rasik.app.{version,platform,openWorkspace}
```

This is the entire boundary between the sandboxed renderer and the OS — nothing else crosses it.

### 8.8 Plugin API (`docs/plugin-authoring/`, `PLUGIN_SYSTEM.md`)

```
PluginAPI
  workspace: { getRoot, readFile, writeFile, listFiles, onFileChanged }
  editor:    { getActiveFile, insertAtCursor, replaceSelection, getSelectedText, showDiff }
  ui:        { showMessage, showInputBox, showQuickPick, registerPanel }
  ai:        { chat, stream, embed }
  commands:  { register, execute }
  events:    { on, emit }
```

Plugin entry contract: `activate(api: PluginAPI): void`, `deactivate(): void`. Manifest: `rasik-plugin.json` (`id`, `type`, `entry`, `permissions[]`, `contributes`, `engines`). 10 declarable permissions gate every namespace above (see `PLUGIN_SYSTEM.md §5`).

---

## 9. Cross-Cutting Conventions

- **Backend layer imports** — enforced direction: `api → application → domain ← infrastructure`; `core` and `domain` import nothing from the rest of the app. Violations are architecture bugs, not style nits (`app/README.md`).
- **Frontend feature isolation** — `features/<a>/` never imports `features/<b>/`; shared data goes through `store/`, shared UI through `components/ui/`.
- **Test mirroring** — every test path mirrors its source path exactly, in both apps (`tests/unit/features/chat/ChatPanel.test.tsx` ↔ `src/features/chat/ChatPanel.tsx`; `tests/unit/application/auth/test_login.py` ↔ `app/application/auth/login.py`).
- **One file, one responsibility** — one use case per file (backend), one component per file (frontend), one tool per registration (agents).
- **Secrets** — never in `config/` (non-secret YAML only) or in code; always environment variables, encrypted at rest where persisted (AES-256-GCM for provider API keys).

---

## 10. Related Documents

| Topic | Document |
|---|---|
| Directory tree with per-folder READMEs | `FOLDER_STRUCTURE.md` |
| Product vision, stack, phases | `PROJECT_MASTER_SPEC.md` |
| Backend layering rationale | `BACKEND_ARCHITECTURE.md` |
| Frontend process model | `FRONTEND_ARCHITECTURE.md` |
| Agent loop, guards, tools | `AGENT_FRAMEWORK.md` |
| Provider abstraction, fallback | `MODEL_ROUTER.md` |
| Schema, migrations, Redis keys | `DATABASE_DESIGN.md` |
| Full REST/WS contracts | `API_SPECIFICATION.md` |
| Auth flows, JWT, encryption | `AUTHENTICATION.md` |
| Plugin manifest & sandbox | `PLUGIN_SYSTEM.md` |
| Workspace lifecycle & settings | `WORKSPACE_MANAGEMENT.md` |
| Git panel & CLI wrapper | `GIT_INTEGRATION.md` |
| Terminal & PTY | `TERMINAL_DESIGN.md` |
| Browser panel & Playwright | `BROWSER_AUTOMATION.md` |
| RAG indexing & search | `RAG_SYSTEM.md` |
| Long-term memory | `MEMORY_SYSTEM.md` |
| Design tokens & components | `UI_DESIGN_SYSTEM.md` |
| Phase status | `PROGRESS.md` |
