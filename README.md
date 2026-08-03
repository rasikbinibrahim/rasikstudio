# Rasik Studio

An original, production-grade AI-native IDE — Electron + React + Monaco on the desktop, FastAPI + PostgreSQL/pgvector + Redis on the backend, with a multi-agent orchestration layer supporting local (Ollama) and cloud (OpenAI, Anthropic, Gemini) models.

Rasik Studio is not a clone of VS Code, Cursor, Cline, OpenHands, or Continue. Those projects are studied for architecture insights only (see `docs/reference/`); all code here is original or integrates license-permitted components with attribution preserved.

## Start here

Read in this order: `CLAUDE.md` → `PROJECT_MASTER_SPEC.md` → `PROGRESS.md` → `docs/roadmap/README.md`.

### Process & planning

| Document | Purpose |
|---|---|
| `CLAUDE.md` | Operating rules for AI-assisted development on this repo |
| `PROJECT_MASTER_SPEC.md` | Product vision, tech stack, feature list, phase index |
| `PROGRESS.md` | Current phase status — read this before starting any work |
| `docs/roadmap/README.md` | Phase-by-phase execution plan (summary table, critical path, sign-off template; one file per phase). `IMPLEMENTATION_ROADMAP.md` redirects here |
| `FOLDER_STRUCTURE.md` | Full directory tree and per-folder rules (authoritative) |
| `PROJECT_STRUCTURE.md` | Module/service/interface reference — what lives where and why |

### Core architecture

| Document | Purpose |
|---|---|
| `BACKEND_ARCHITECTURE.md` | FastAPI service: Clean Architecture layers, DI, error handling |
| `FRONTEND_ARCHITECTURE.md` | Electron + React renderer, process model, IPC bridge |
| `AI_ARCHITECTURE.md` | How the model router, agents, RAG, and memory fit together |
| `DATABASE_DESIGN.md` | PostgreSQL/pgvector schema, Redis structures, migrations |
| `API_SPECIFICATION.md` | REST + WebSocket endpoint reference |

### AI subsystems

| Document | Purpose |
|---|---|
| `MODEL_ROUTER.md` | Unified provider interface (Ollama/Anthropic/OpenAI/Gemini), streaming, fallback |
| `AGENT_FRAMEWORK.md` | ReAct agent loop, tool registry, approval gates, orchestration |
| `MEMORY_SYSTEM.md` | Short-term and long-term (vector) memory for agents and chat |
| `RAG_SYSTEM.md` | Codebase indexing and semantic search pipeline |

### Feature subsystems

| Document | Purpose |
|---|---|
| `WORKSPACE_MANAGEMENT.md` | Workspace lifecycle, settings, file watcher, templates |
| `GIT_INTEGRATION.md` | Git CLI wrapper, status panel, diff editor, AI commit messages |
| `TERMINAL_DESIGN.md` | xterm.js + node-pty terminal, tabs, agent access |
| `BROWSER_AUTOMATION.md` | Embedded browser panel + Playwright agent tools |
| `PLUGIN_SYSTEM.md` | Plugin manifest, permissions, sandbox, lifecycle |
| `AUTHENTICATION.md` | Local-first + OAuth2 auth, JWT design, API key encryption |

### Cross-cutting & quality

| Document | Purpose |
|---|---|
| `UI_DESIGN_SYSTEM.md` | Design tokens, component library, theming |
| `SECURITY_GUIDELINES.md` | Threat model, Electron hardening, input validation, secrets |
| `TESTING_STRATEGY.md` | Test pyramid, coverage targets, CI pipeline |
| `PERFORMANCE_GUIDE.md` | Performance targets and optimization techniques per layer |
| `DEPLOYMENT_GUIDE.md` | Local dev setup, Docker Compose, desktop packaging |

### Supplementary docs

`docs/` holds audience-specific documentation that supplements (never duplicates) the root docs above — ADRs, API reference, plugin authoring guide, reference-project analyses, the roadmap, and the user guide. See [`docs/README.md`](docs/README.md) for the full breakdown.

## Layout

```
apps/       Deployable applications (desktop, backend)
packages/   Shared internal packages (desktop-types)
docs/       ADRs, API reference, plugin authoring guide, user guide, reference analyses
.github/    CI/CD workflows
```

Every folder in this repository contains its own `README.md` explaining its purpose — read the local `README.md` before adding files anywhere.

## Status

Pre-development: documentation and folder structure complete, no implementation yet. See `PROGRESS.md` for phase-by-phase status.
