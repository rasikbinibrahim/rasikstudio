# ADR 0003: Database — PostgreSQL + pgvector (not a separate vector DB)

## Status

Accepted (2026-08-03)

## Context

The system needs both conventional relational storage (users, workspaces, chat sessions,
messages, agent tasks) and vector similarity search (code embeddings for RAG, workspace
memories). A separate vector database (Pinecone, Chroma, Weaviate, Qdrant) is a common pattern
for the latter.

## Decision

Use a single PostgreSQL 16 instance with the `pgvector` extension for both relational and vector
data — no separate vector database.

## Rationale

- **Fewer infrastructure components to run, deploy, and keep in sync.** A separate vector DB
  means a second connection pool, a second set of credentials, and — critically — no
  transactional consistency between "save this chat message" and "save its embedding," which
  would otherwise need a distributed-transaction or eventual-consistency story neither this
  project's scale nor timeline justifies.
- **`pgvector`'s HNSW index performance is good enough for the target scale** (a single
  workspace's codebase — realistically thousands to low hundreds-of-thousands of embedded
  chunks, not the tens-of-millions-plus scale where a purpose-built vector DB's extra
  sophistication starts to matter).
- **One backup/restore story, one connection pool, one set of migrations** (Alembic already
  covers both the relational tables and the `VECTOR(768)` columns identically).

## Alternatives Considered

- **Chroma** — simple, embeddable, but a separate service with its own persistence story to
  operationalize alongside Postgres.
- **Pinecone** — managed, no ops burden, but a paid external dependency this local-first,
  privacy-first project (see the Decisions Log's "no account required for core features" entry)
  doesn't want to require.
- **Qdrant/Weaviate** — closer to `pgvector`'s performance envelope but still a second database
  to run and keep consistent with Postgres.

## Consequences

- Vector search performance is bounded by what a single Postgres instance (with HNSW indexing)
  can deliver — acceptable at this project's target scale, would need re-evaluation if a
  future direction needed to index embeddings across many workspaces/tenants at once, not just
  one workspace's own codebase at a time.
- Embedding dimensionality is fixed per deployment (`VECTOR(768)`, see ADR 0010) — changing
  models means dropping and rebuilding all embeddings, no partial migration path (documented in
  `app/infrastructure/vector/README.md`).

## Outcome

Confirmed correct through Phase 16. `code_embeddings`/`workspace_memories` (`VECTOR(768)`, HNSW
indexes) have been real, tested tables since Phase 5 — `EXPLAIN` output confirmed real index
scans, not sequential scans, at build time. The one real gap isn't with `pgvector` itself: no
workspace-indexing pipeline exists yet to actually populate `code_embeddings` for a real
workspace (deferred pending the Celery infrastructure ADR 0004 describes but was never built —
`EmbeddingRepository.search()` is real and tested, it simply has nothing to find on a workspace
nobody has indexed). RAG in Phase 10's chat context builder is real code against an empty table,
not fabricated results — a real, honestly-tracked gap, not a flaw in this decision.
