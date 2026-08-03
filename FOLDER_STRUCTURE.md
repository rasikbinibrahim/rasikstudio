# Folder Structure — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

Every folder in this tree contains a `README.md` explaining its purpose, naming conventions, and rules. Read the README before adding files to any folder.

---

```
rasik-studio/
│
├── .github/                         # GitHub configuration
│   └── workflows/                   # CI/CD GitHub Actions workflows
│
├── apps/                            # Deployable applications
│   │
│   ├── desktop/                     # Electron desktop application
│   │   │
│   │   ├── build/                   # electron-builder static resources
│   │   │   └── icons/               # App icons for all platforms
│   │   │
│   │   ├── electron/                # Electron main process (Node.js)
│   │   │   ├── main/                # App entry, window management, core services
│   │   │   │   └── ipc/             # IPC handler registrations (per domain)
│   │   │   ├── preload/             # contextBridge API surface (preload scripts)
│   │   │   └── services/            # Long-lived main-process services
│   │   │
│   │   ├── src/                     # React renderer process
│   │   │   ├── components/          # Shared, reusable React components
│   │   │   │   └── ui/              # Design system primitives (Button, Input, etc.)
│   │   │   │
│   │   │   ├── features/            # Self-contained feature modules
│   │   │   │   ├── agent/           # Agent task panel and step viewer
│   │   │   │   ├── browser/         # In-IDE web browser panel
│   │   │   │   ├── chat/            # AI chat interface
│   │   │   │   ├── command-palette/ # Global command palette (Ctrl+Shift+P)
│   │   │   │   ├── docker/          # Docker container management panel
│   │   │   │   ├── editor/          # Monaco editor + LSP client + tabs
│   │   │   │   ├── extensions/      # Plugin/extension marketplace panel
│   │   │   │   ├── file-explorer/   # File tree, file operations
│   │   │   │   ├── git/             # Git status, staging, diff, commits
│   │   │   │   ├── search/          # Global search (semantic + text)
│   │   │   │   ├── settings/        # Settings UI (all layers)
│   │   │   │   └── terminal/        # xterm.js terminal tabs
│   │   │   │
│   │   │   ├── hooks/               # Shared React hooks
│   │   │   ├── layout/              # IDE chrome (ActivityBar, panels, StatusBar)
│   │   │   ├── lib/                 # Pure utility functions (no React, no side effects)
│   │   │   ├── services/            # HTTP client, WebSocket client, IPC bridge
│   │   │   ├── store/               # Zustand state slices
│   │   │   ├── styles/              # Global CSS and design tokens
│   │   │   │   └── themes/          # Theme JSON files (dark, light, high-contrast)
│   │   │   └── types/               # Shared TypeScript type declarations
│   │   │
│   │   └── tests/                   # Desktop test suites
│   │       ├── e2e/                 # Playwright end-to-end tests (full Electron)
│   │       │   └── fixtures/        # Workspace fixtures, mock backends
│   │       └── unit/                # Vitest unit tests (mirrors src/ structure)
│   │           ├── components/
│   │           │   └── ui/
│   │           ├── features/
│   │           │   ├── agent/
│   │           │   ├── browser/
│   │           │   ├── chat/
│   │           │   ├── editor/
│   │           │   ├── file-explorer/
│   │           │   ├── git/
│   │           │   └── terminal/
│   │           ├── hooks/
│   │           └── store/
│   │
│   └── backend/                     # FastAPI backend service
│       │
│       ├── alembic/                 # Database migration management
│       │   └── versions/            # Individual migration scripts
│       │
│       ├── app/                     # Application source (Clean Architecture)
│       │   │
│       │   ├── agents/              # Agent orchestration layer
│       │   │   └── tools/           # All agent tool implementations
│       │   │
│       │   ├── api/                 # Transport layer (FastAPI routers)
│       │   │   ├── v1/              # REST API version 1 endpoints
│       │   │   └── ws/              # WebSocket gateway
│       │   │
│       │   ├── application/         # Use cases (application services)
│       │   │   ├── agents/          # Agent task use cases
│       │   │   ├── auth/            # Authentication use cases
│       │   │   ├── chat/            # Chat session use cases
│       │   │   ├── memory/          # Memory extraction and retrieval use cases
│       │   │   ├── rag/             # RAG indexing and search use cases
│       │   │   └── workspaces/      # Workspace lifecycle use cases
│       │   │
│       │   ├── core/                # Cross-cutting concerns
│       │   │   └── middleware/      # FastAPI middleware (auth, logging, rate limit)
│       │   │
│       │   ├── domain/              # Business entities and contracts
│       │   │   ├── models/          # Pure Python dataclasses (no ORM)
│       │   │   ├── ports/           # Abstract interfaces (repositories, services)
│       │   │   └── services/        # Domain logic (no I/O)
│       │   │
│       │   └── infrastructure/      # Concrete implementations of domain ports
│       │       ├── ai/              # AI provider implementations + model router
│       │       ├── browser/         # Playwright browser automation service
│       │       ├── cache/           # Redis client and cache helpers
│       │       ├── db/              # SQLAlchemy ORM layer
│       │       │   ├── models/      # ORM model definitions
│       │       │   └── repositories/# Concrete repository implementations
│       │       └── vector/          # pgvector embedding store
│       │
│       ├── config/                  # Configuration files (YAML, non-secret)
│       ├── scripts/                 # One-off operational scripts
│       └── tests/                   # Backend test suites
│           ├── integration/         # Tests requiring real DB and Redis
│           │   ├── agents/
│           │   ├── api/
│           │   └── infrastructure/
│           └── unit/                # Pure unit tests (no I/O)
│               ├── agents/
│               │   └── tools/
│               ├── application/
│               │   ├── agents/
│               │   ├── auth/
│               │   └── chat/
│               ├── core/
│               ├── domain/
│               └── infrastructure/
│                   ├── ai/
│                   └── db/
│
├── docs/                            # All project documentation
│   ├── adr/                         # Architecture Decision Records
│   ├── api/                         # Human-readable API reference
│   ├── plugin-authoring/            # Plugin SDK documentation
│   │   └── examples/                # Complete example plugins
│   ├── reference/                   # Reference project analyses
│   │   ├── cline/
│   │   ├── continue/
│   │   ├── libgit2/
│   │   ├── monaco/
│   │   ├── ollama/
│   │   ├── openhands/
│   │   ├── playwright/
│   │   ├── vscodium/
│   │   └── xterm/
│   ├── roadmap/                     # Phase-by-phase implementation plan (one file per phase)
│   └── user-guide/                  # End-user documentation
│
└── packages/                        # Shared internal packages
    └── desktop-types/               # Auto-generated TypeScript types from OpenAPI
        └── src/                     # Generated type files (do not edit manually)
```

---

## Folder Count

| Area | Folders |
|---|---|
| `.github/` | 2 |
| `apps/desktop/` | 36 |
| `apps/backend/` | 37 |
| `docs/` | 15 |
| `packages/` | 3 |
| **Total** | **93** |

---

## Rules

1. Every folder must have a `README.md`.
2. Source files go only in the innermost relevant folder — never in a parent that has children.
3. Test files mirror source file paths exactly: `src/features/chat/ChatPanel.tsx` → `tests/unit/features/chat/ChatPanel.test.tsx`.
4. No cross-feature imports: `features/chat/` may not import from `features/git/`.
5. `components/ui/` contains only design system primitives — stateless and feature-agnostic.
6. `lib/` contains only pure functions with zero side effects and zero React dependencies.
