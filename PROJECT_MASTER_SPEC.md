# PROJECT MASTER SPECIFICATION — Rasik Studio AI IDE

**Version:** 1.0.0 (this document's own version — not a claim that the product has shipped v1.0.0; it hasn't)
**Created:** 2026-08-03
**Status:** Active Development — ~86% through the 18-phase roadmap as of 2026-08-11; see `PROGRESS.md` for the real, continuously-verified status. Not shipped: Windows/macOS code signing, a plugin runtime, and a live CI run all remain open. Real Celery infrastructure and workspace RAG indexing (ADR 0004, previously blocked pending exactly that infrastructure) both landed 2026-08-11. `phase-17-documentation.md`'s own "update status to v1.0.0 shipped" instruction is not followed literally here since it isn't true yet — this line reflects the real state instead.

---

## 1. Executive Summary

Rasik Studio is a production-grade AI-native Integrated Development Environment (IDE) built as an original product. It combines a Monaco-powered editor, multi-model AI agents, a FastAPI backend, terminal, browser automation, Git integration, Docker/Kubernetes support, and a plugin system — all in a single Electron desktop application.

This is **not** a clone of any existing product. Reference projects (VS Code, Cursor, Cline, OpenHands, Continue) are studied for architecture insights only. All code is original or integrates open-source components with license compliance.

---

## 2. Product Vision

| Attribute | Description |
|---|---|
| **Category** | AI-native desktop IDE |
| **Target Users** | Professional software engineers, AI developers, indie hackers |
| **Platform** | Windows, macOS, Linux (Electron) |
| **AI Model Support** | Local (Ollama) + Cloud (OpenAI, Anthropic, Gemini) |
| **Core Differentiator** | Multi-agent orchestration with full workspace awareness, browser automation, and RAG over the project codebase |

---

## 3. Technology Stack

### 3.1 Desktop / Frontend

| Layer | Technology | Purpose |
|---|---|---|
| Shell | Electron | Cross-platform desktop runtime |
| UI Framework | React 18 + TypeScript | Component-based UI |
| Editor | Monaco Editor | Code editing (same engine as VS Code) |
| Terminal | xterm.js | Embedded terminal emulator |
| State Management | Zustand | Global application state |
| Styling | Tailwind CSS | Utility-first design system |
| IPC | Electron IPC / contextBridge | Secure main↔renderer communication |
| Build | Vite + electron-builder | Fast bundling and packaging |

### 3.2 Backend

| Layer | Technology | Purpose |
|---|---|---|
| API Framework | FastAPI (Python 3.12+) | REST + WebSocket server |
| Task Queue | Celery + Redis | Background agent jobs |
| Database ORM | SQLAlchemy 2.0 | Async ORM with migrations |
| Migrations | Alembic | Schema version control |
| Cache / Pub-Sub | Redis | Session cache, agent event bus |
| Primary DB | PostgreSQL 16 | Persistent storage |
| Auth | JWT + OAuth2 | Authentication and authorization |
| Container | Docker + Docker Compose | Local development runtime |

### 3.3 AI / Agent Layer

| Component | Technology | Purpose |
|---|---|---|
| Local inference | Ollama | Run local models |
| Local models | DeepSeek, Qwen, Llama, Mistral | On-device AI |
| Cloud AI | OpenAI, Anthropic, Gemini | Optional cloud models |
| Embeddings | nomic-embed-text (local) | Codebase RAG embeddings |
| Vector store | pgvector (PostgreSQL) | Semantic search over code |
| Agent framework | Custom (inspired by OpenHands) | Multi-agent orchestration |
| Browser automation | Playwright | Web browsing agent action |

### 3.4 DevOps / Infrastructure

| Component | Technology |
|---|---|
| Containerization | Docker |
| Orchestration | Kubernetes (optional self-hosted) |
| CI/CD | GitHub Actions |
| Secrets | .env + Vault (production) |
| Logging | Structlog + OpenTelemetry |
| Monitoring | Prometheus + Grafana |

---

## 4. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                  Electron Shell                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │              React Renderer Process              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │  │
│  │  │  Monaco  │  │  xterm   │  │  AI Chat UI   │  │  │
│  │  │  Editor  │  │ Terminal │  │  (Sidebar)    │  │  │
│  │  └──────────┘  └──────────┘  └───────────────┘  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │  │
│  │  │   Git    │  │ Browser  │  │  Settings /   │  │  │
│  │  │  Panel   │  │  Panel   │  │  Extensions   │  │  │
│  │  └──────────┘  └──────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Electron Main Process               │  │
│  │  File System · OS Shell · IPC Bridge            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬───────────────────────────────────┘
                     │ HTTP / WebSocket
┌────────────────────▼───────────────────────────────────┐
│                  FastAPI Backend                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │   Auth   │  │   API    │  │   WebSocket Gateway  │  │
│  │  Router  │  │  Router  │  │   (Agent Events)     │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Agent Orchestrator                  │  │
│  │  Planner → Tool Executor → Memory → Reflector   │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Model   │  │   RAG    │  │    Tool Registry     │  │
│  │  Router  │  │  Engine  │  │  (FS, Shell, Git...) │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└───────┬──────────────┬────────────────────────────────-─┘
        │              │
┌───────▼──────┐ ┌─────▼──────┐
│  PostgreSQL  │ │   Redis    │
│  + pgvector  │ │   Cache    │
└──────────────┘ └────────────┘
```

---

## 5. Feature Specification

### 5.1 AI Chat
- Multi-turn conversation with context window management
- Workspace-aware (sends relevant files as context)
- Supports local (Ollama) and cloud models
- Streaming responses via WebSocket
- Message history persisted per workspace

### 5.2 AI Coding Assistant
- Inline code completions (Monaco IntelliSense integration)
- Explain selected code
- Refactor selected code
- Generate code from natural language
- Auto-fix lint/type errors

### 5.3 AI Debugger
- Analyze stack traces
- Suggest fixes for runtime errors
- Step-through explanation of code execution
- Variable inspection narration

### 5.4 AI Refactoring
- Detect code smells
- Suggest and apply refactoring patterns
- Preview diffs before applying
- Multi-file refactoring with dependency tracking

### 5.5 AI Documentation
- Generate JSDoc / docstring for functions
- Generate README sections
- Maintain documentation in sync with code changes

### 5.6 AI Testing
- Generate unit tests for selected functions
- Generate integration test scaffolding
- Analyze test coverage gaps

### 5.7 Git Integration
- Stage, commit, push, pull
- View diffs with Monaco diff editor
- Branch management
- AI-generated commit messages
- Conflict resolution assistant

### 5.8 Terminal
- Embedded xterm.js terminal
- Multiple terminal sessions (tabs)
- Agent can execute commands in terminal
- Command history and search

### 5.9 Browser Panel
- Embedded Playwright-controlled browser
- Agent can navigate, click, type, screenshot
- Used for web research and testing

### 5.10 Docker / Kubernetes
- View running containers
- Start/stop/restart containers
- View logs
- Kubernetes pod management (optional)

### 5.11 Plugin System
- Plugin API with sandboxed access
- Plugin marketplace (future)
- Theme plugins
- Language support plugins

### 5.12 Workspace Management
- Open multiple projects
- Workspace-level settings
- Per-workspace AI memory

### 5.13 Memory & RAG
- Index codebase into vector store on open
- Incremental re-indexing on file change
- Semantic search over codebase
- Agent long-term memory per workspace

### 5.14 Multi-Agent Orchestration
- Planner agent decomposes tasks
- Specialized sub-agents: coder, tester, debugger, docs writer
- Agents communicate via message bus (Redis)
- Human-in-the-loop approval gates

### 5.15 Authentication
- Local-first (no auth required for local use)
- Optional cloud account for sync/settings backup
- OAuth2 (GitHub, Google) for cloud features
- JWT session management

### 5.16 Settings
- Editor preferences (font, theme, keybindings)
- AI model selection per feature
- API key management (encrypted at rest)
- Telemetry opt-in/out

### 5.17 Voice (Phase 2+)
- Voice-to-text for AI chat input
- Text-to-speech for AI responses
- Voice commands for IDE actions

### 5.18 Code Review
- AI code review on demand
- PR review integration (GitHub/GitLab)
- Inline comment suggestions

---

## 6. Development Phases

### Phase 1 — Project Architecture
**Goal:** Establish monorepo structure, tooling, and build pipeline.

Deliverables:
- Monorepo layout (apps/desktop, apps/backend, packages/*)
- TypeScript + ESLint + Prettier config
- Python project setup (pyproject.toml, ruff, mypy)
- Docker Compose for local dev
- GitHub Actions CI skeleton

### Phase 2 — Folder Structure
**Goal:** Create all directories, placeholder files, and module boundaries before writing logic.

Deliverables:
- Complete directory tree for all apps and packages
- Module index files
- Barrel exports
- Interface/type definition stubs

### Phase 3 — Desktop Application
**Goal:** Working Electron shell with React, Monaco Editor, and xterm.js.

Deliverables:
- Electron main/renderer separation with contextBridge
- Monaco Editor initialized with basic theme
- Sidebar layout (Explorer, AI Chat, Git, Extensions)
- xterm.js terminal panel
- File explorer with file open/save via IPC

### Phase 4 — Backend
**Goal:** FastAPI server with project structure, dependency injection, and core routers.

Deliverables:
- FastAPI app factory
- Router modules (health, workspace, files, agents)
- Dependency injection container
- Environment configuration management
- CORS + security middleware

### Phase 5 — Database
**Goal:** PostgreSQL schema, migrations, and ORM models.

Deliverables:
- Alembic migration setup
- SQLAlchemy async models: User, Workspace, ChatSession, Message, AgentTask
- pgvector extension for embeddings
- Connection pooling

### Phase 6 — Authentication
**Goal:** Secure auth system with local and cloud modes.

Deliverables:
- JWT access + refresh token flow
- OAuth2 GitHub/Google integration
- API key encryption service
- Auth middleware and guards

### Phase 7 — WebSocket
**Goal:** Real-time bidirectional communication for streaming AI and agent events.

Deliverables:
- WebSocket connection manager
- Event schema (agent_start, agent_step, agent_done, stream_chunk, error)
- Client-side WebSocket hook in React
- Reconnection logic

### Phase 8 — Agent Framework
**Goal:** Core agent orchestration engine.

Deliverables:
- Agent base class and interfaces
- Tool registry (file read/write, shell exec, browser, search)
- Planner → Executor → Reflector loop
- Agent memory (short-term context + long-term vector store)
- Human approval gate
- Agent event streaming via WebSocket

### Phase 9 — Model Router
**Goal:** Unified interface to local and cloud AI models.

Deliverables:
- Model provider abstraction (OpenAI, Anthropic, Ollama)
- Streaming response adapter
- Token counting and context truncation
- Model selection per feature type
- Fallback chain (local → cloud)

### Phase 10 — AI Chat
**Goal:** Full AI chat feature end-to-end.

Deliverables:
- Chat UI component (message list, input, streaming indicator)
- Chat session management (create, rename, delete, history)
- Context builder (sends open files, workspace info)
- Tool use in chat (file read, search, run command)

### Phase 11 — Terminal
**Goal:** Embedded terminal with agent access.

Deliverables:
- xterm.js terminal component
- PTY backend via node-pty (Electron main)
- Multiple terminal tabs
- Agent can write commands and read output

### Phase 12 — Git
**Goal:** Git integration panel.

Deliverables:
- Git status, stage, commit, push, pull via CLI wrapper
- Monaco diff editor for file diffs
- Branch list and checkout
- AI commit message generation
- Merge conflict display

### Phase 13 — Browser
**Goal:** Embedded browser panel controlled by Playwright.

Deliverables:
- BrowserView in Electron (or WebContentsView)
- Playwright backend service for agent control
- Screenshot capture API
- Navigation controls in UI

### Phase 14 — Docker
**Goal:** Docker management panel.

Deliverables:
- Docker daemon socket client (via Dockerode or CLI)
- Container list with status
- Start/stop/restart/remove actions
- Log streaming per container

### Phase 15 — Deployment
**Goal:** Package and distribute the desktop app.

Deliverables:
- electron-builder config for Windows, macOS, Linux
- Auto-updater
- Code signing setup (placeholder for real certificates)
- Docker image for backend
- Kubernetes manifests (optional)

### Phase 16 — Testing
**Goal:** Full test coverage across frontend and backend.

Deliverables:
- Unit tests: Vitest (frontend), pytest (backend)
- Integration tests: API test suite with TestClient
- E2E tests: Playwright tests for Electron app
- Test coverage reporting

### Phase 17 — Documentation
**Goal:** Complete developer and user documentation.

Deliverables:
- Architecture Decision Records (ADRs)
- API documentation (auto-generated from FastAPI)
- Component storybook
- User guide

### Phase 18 — Optimization
**Goal:** Performance, security hardening, and polish.

Deliverables:
- Frontend bundle analysis and code splitting
- Backend query optimization
- Security audit (OWASP top 10)
- Memory / CPU profiling
- Startup time optimization
- Accessibility audit

---

## 7. Directory Structure (Target)

> **See `FOLDER_STRUCTURE.md` for the full, authoritative directory tree.** The sketch below is illustrative only; where it conflicts with `FOLDER_STRUCTURE.md`, the latter wins (e.g. `packages/` contains only `desktop-types/`, generated from the OpenAPI schema per ADR 0007 — not separate `shared-types`/`ui-components`/`agent-protocol` packages; there is no root-level `infra/` or `scripts/` — `docker-compose.yml` lives at repo root and operational scripts live under `apps/backend/scripts/`).

```
rasik-studio/
├── apps/
│   ├── desktop/                   # Electron + React app
│   │   ├── electron/              # Main process
│   │   │   ├── main/
│   │   │   ├── preload/
│   │   │   └── services/
│   │   └── src/                   # Renderer process
│   │       ├── components/
│   │       ├── features/
│   │       ├── hooks/
│   │       ├── store/
│   │       ├── services/
│   │       └── types/
│   └── backend/                   # FastAPI app
│       ├── app/
│       │   ├── api/
│       │   ├── agents/
│       │   ├── application/
│       │   ├── domain/
│       │   ├── infrastructure/
│       │   └── core/
│       ├── tests/
│       ├── config/
│       ├── scripts/
│       └── alembic/
├── packages/
│   └── desktop-types/             # Types generated from the OpenAPI schema
├── docs/
│   ├── adr/                       # Architecture Decision Records
│   ├── api/
│   ├── plugin-authoring/
│   ├── reference/
│   └── user-guide/
├── CLAUDE.md
├── PROJECT_MASTER_SPEC.md
├── FOLDER_STRUCTURE.md
├── PROGRESS.md
├── docker-compose.yml
└── package.json                   # Monorepo root (pnpm workspaces)
```

---

## 8. Data Models (Core)

### 8.1 User
```
id, email, name, avatar_url, auth_provider, hashed_password,
created_at, updated_at, is_active, settings (JSON)
```

### 8.2 Workspace
```
id, user_id, name, root_path, created_at, updated_at,
settings (JSON), last_opened_at
```

### 8.3 ChatSession
```
id, workspace_id, user_id, title, model, created_at, updated_at
```

### 8.4 Message
```
id, session_id, role (user|assistant|system|tool),
content, tool_calls (JSON), token_count, created_at
```

### 8.5 AgentTask
```
id, workspace_id, session_id, status (pending|running|paused|done|failed),
plan (JSON), steps (JSON), result, error, created_at, updated_at
```

### 8.6 CodeEmbedding
```
id, workspace_id, file_path, chunk_index, content, embedding (vector),
language, created_at
```

---

## 9. API Surface (Key Endpoints)

| Method | Path | Description |
|---|---|---|
| POST | /auth/login | Username/password login |
| POST | /auth/refresh | Refresh JWT |
| GET | /workspaces | List user workspaces |
| POST | /workspaces | Create workspace |
| GET | /workspaces/{id}/files | List files in workspace |
| GET | /workspaces/{id}/files/content | Read file content |
| POST | /workspaces/{id}/files/content | Write file content |
| GET | /chat/sessions | List chat sessions |
| POST | /chat/sessions | Create chat session |
| POST | /chat/sessions/{id}/messages | Send message (streaming) |
| POST | /agents/tasks | Start agent task |
| GET | /agents/tasks/{id} | Get task status |
| POST | /agents/tasks/{id}/approve | Approve pending action |
| WS | /ws/{workspace_id} | WebSocket event stream |
| POST | /git/status | Git status for workspace |
| POST | /git/commit | Stage and commit |
| POST | /search/semantic | Semantic code search |

---

## 10. Security Requirements

- All API endpoints require authentication (except /auth/*)
- API keys stored encrypted (AES-256) at rest
- No secrets in code or logs
- CSP headers on all HTTP responses
- Electron contextIsolation enabled, nodeIntegration disabled
- Input validation on all API endpoints (Pydantic)
- SQL injection prevention via ORM parameterized queries
- Rate limiting on auth endpoints
- HTTPS only in production
- Dependency vulnerability scanning in CI

---

## 11. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Editor startup time | < 2 seconds |
| AI first token latency (local) | < 500ms |
| AI first token latency (cloud) | < 1500ms |
| File open time | < 100ms |
| Terminal input lag | < 10ms |
| Backend API p99 latency | < 200ms |
| Test coverage | ≥ 80% |
| Accessibility | WCAG 2.1 AA |

---

## 12. Reference Analysis Summary

| Reference | Key Lessons | License |
|---|---|---|
| VSCodium | Extension API design, Monaco integration patterns | MIT |
| Cline | Tool-use agent loop, streaming diff application | Apache 2.0 |
| OpenHands | Multi-agent architecture, sandbox execution | MIT |
| Continue | Context providers, slash commands, model abstraction | Apache 2.0 |
| Ollama | Local model API design, streaming format | MIT |

---

## 13. Current Phase

**Phase 1 — Project Architecture**

See `PROGRESS.md` for detailed status of each phase.

---

## 14. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-08-03 | 1.0.0 | Initial specification created |
