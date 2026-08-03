# Phase 1 — Project Architecture

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** —
**Estimated effort:** 1 week

---

## Objective

Establish every architectural decision in writing before a single source file is created. This phase produces no application code — only decision documents, reference analyses, and the ADR log. The output is the foundation every subsequent phase builds on. If a decision is made here without a record, it becomes technical debt immediately.

## Architecture

This phase is purely intellectual and documentary. The architect (you) reads the 9 reference projects, makes all major technology choices, documents the rationale, and produces the ADR directory. The output governs all 17 subsequent phases.

Reference projects to analyze (each across all 11 dimensions in `CLAUDE.md`):
- **VSCodium** — IDE shell, process model, extension host
- **Cline** — AI agent implementation, tool loop, approval gates
- **OpenHands** — autonomous agent design, multi-agent orchestration, sandbox
- **Continue** — AI chat integration in IDE, context building, streaming
- **Ollama** — local model serving, REST API design, streaming protocol
- **Monaco Editor** — editor setup, language services, web worker model
- **Playwright** — browser automation API, screenshot streaming, session lifecycle
- **xterm.js** — terminal emulation, WebGL renderer, addon system
- **libgit2 / Git CLI** — Git operation tradeoffs (native binding vs subprocess)

Key decisions to finalize and record:
- Electron vs. Tauri (evaluate both; record why the choice is made)
- WebSocket-only streaming vs. SSE+WebSocket hybrid
- Celery for background tasks — **resolved**: Celery over arq, for its mature retry/rate-limiting/beat-scheduling support needed by agent task execution and RAG indexing (see ADR 0004 and `PROGRESS.md` Decisions Log)
- First-message WebSocket auth vs. query-param JWT
- OpenAPI-generated TypeScript types vs. manual `shared-types` package
- Row-level security approach for multi-user deployment
- Agent steps normalization (separate table vs. JSONB array)

## Dependencies

- All existing documentation files (read before starting)
- External: access to each reference repository (GitHub)

## Files to Create

```
docs/
├── adr/
│   ├── 0001-desktop-framework-electron-vs-tauri.md
│   ├── 0002-backend-framework-fastapi.md
│   ├── 0003-database-postgresql-pgvector.md
│   ├── 0004-background-tasks-arq-vs-celery.md
│   ├── 0005-websocket-auth-first-message.md
│   ├── 0006-streaming-architecture-unified-websocket.md
│   ├── 0007-type-sharing-openapi-generated.md
│   ├── 0008-git-implementation-cli-subprocess.md
│   ├── 0009-agent-steps-normalized-table.md
│   └── 0010-embedding-model-nomic-768d.md
│
├── reference/
│   ├── vscodium/ANALYSIS.md (+ ARCHITECTURE_NOTES.md, LICENSE_NOTES.md)
│   ├── cline/ANALYSIS.md (+ TOOL_DESIGN_NOTES.md, APPROVAL_GATE_NOTES.md, LICENSE_NOTES.md)
│   ├── openhands/ANALYSIS.md (+ SANDBOX_NOTES.md, MULTI_AGENT_NOTES.md, LICENSE_NOTES.md)
│   ├── continue/ANALYSIS.md (+ CONTEXT_BUILDING_NOTES.md, COMPLETION_NOTES.md, LICENSE_NOTES.md)
│   ├── ollama/ANALYSIS.md (+ API_NOTES.md, TOKENIZER_NOTES.md, LICENSE_NOTES.md)
│   ├── monaco/ANALYSIS.md (+ ELECTRON_SETUP_NOTES.md, LSP_INTEGRATION_NOTES.md, THEMING_NOTES.md, LICENSE_NOTES.md)
│   ├── playwright/ANALYSIS.md (+ SESSION_LIFECYCLE_NOTES.md, SCREENSHOT_NOTES.md, LICENSE_NOTES.md)
│   ├── xterm/ANALYSIS.md (+ WEBGL_SETUP_NOTES.md, ADDON_NOTES.md, PTY_INTEGRATION_NOTES.md, LICENSE_NOTES.md)
│   └── libgit2/ANALYSIS.md (+ CLI_VS_NATIVE_NOTES.md, LICENSE_NOTES.md)
```

(See `docs/reference/README.md` for the per-project file layout, already scaffolded with folder READMEs.)

## Files to Modify

- `PROGRESS.md` — update Phase 1 status, record all ADR decisions in Decisions Log
- All existing architecture docs — incorporate any corrections found during reference analysis

## Acceptance Criteria

- [ ] All 9 reference projects analyzed across all 11 dimensions
- [ ] All 10 ADRs written with: context, decision, rationale, trade-offs, consequences
- [ ] Each ADR references the analysis findings that informed it
- [ ] All major decisions listed above are resolved (not deferred)
- [ ] `PROGRESS.md` Decisions Log updated with all 10 decisions
- [ ] No contradictions exist between ADRs and the architecture documents
- [ ] License requirements documented for every dependency

## Testing Strategy

No software tests in this phase. Quality gate: peer review of all 10 ADRs. Each ADR must pass the "future developer test": a developer who joins the project 6 months from now must be able to understand why the decision was made from the ADR alone.

## Estimated Effort

**5 working days**
- Day 1–2: Read and analyze 9 reference repositories
- Day 3: Write the reference analyses
- Day 4: Write ADRs 0001–0005
- Day 5: Write ADRs 0006–0010, update `PROGRESS.md`
