# ADR 0010: Embedding Model — `nomic-embed-text` (768 dimensions)

## Status

Accepted (2026-08-03)

## Context

RAG (code context retrieval for chat, per ADR 0003's `pgvector` decision) needs a fixed embedding
model — `pgvector` columns are declared with a fixed dimensionality (`VECTOR(N)`), and switching
models later means dropping and rebuilding every stored embedding (no partial migration path).
The choice needed to work well locally (this project's "local-first" default) while still having
a usable cloud fallback.

## Decision

`nomic-embed-text` (768 dimensions) as the primary/default embedding model, run locally via
Ollama, with `text-embedding-3-small`/`-large` (OpenAI) as the configured cloud fallback chain.

## Rationale

- **Runs well locally via Ollama** — consistent with this project's local-first default (no
  account/cloud dependency required for core features, per the Decisions Log) and with `chat`'s
  own local-model-first design.
- **768 dimensions is a reasonable middle ground** — enough representational capacity for code
  semantic search, without the storage/index-size cost of a much larger dimensionality (e.g.
  1536+) that wouldn't meaningfully improve retrieval quality for this use case.
- **Good quality for code specifically**, not just general text — a real factor for a coding
  IDE's RAG use case, not a generic embedding benchmark.

## Alternatives Considered

- **OpenAI `text-embedding-3-small`/`-large`** — used as the fallback chain, not the primary,
  specifically to keep the default path local/free; would work as primary too if a future
  direction wanted a fully-cloud default.
- **A larger local model** (e.g. a 1024+-dimension embedding model) — more representational
  capacity, more storage/index cost, not judged worth it for this project's target scale (a
  single workspace's codebase, not a multi-tenant search index).

## Consequences

- `code_embeddings.embedding`/`workspace_memories.embedding` are fixed at `VECTOR(768)` — changing
  the primary embedding model in the future requires dropping and rebuilding every stored
  embedding, no partial/incremental migration.
- `ModelRouter`'s provider-name resolution needed an explicit override table for embedding model
  names specifically (`nomic-embed-text`, `text-embedding-3-small/-large` don't fit the
  colon-prefix/chat-model-shaped resolution rules built for chat models) — a real gap caught by
  `test_embedding_service.py`, not anticipated at decision time.

## Outcome

Confirmed correct and fully implemented since Phase 9 (`EmbeddingService`, real batched calls +
its own fallback chain) / Phase 5 (the `VECTOR(768)` schema itself, HNSW-indexed, confirmed via
real `EXPLAIN` output showing an index scan). The provider-name-resolution gap noted above was
caught and fixed the same session it was introduced (an explicit override table checked before
the prefix-matching rules, documented in `MODEL_ROUTER.md` §5) — without that fix, the fallback
chain this ADR's own decision specifies would have been unusable the first time anything actually
called it. As of Phase 16, nothing has indexed a real workspace yet (`code_embeddings` stays
empty pending the Celery-dependent indexing pipeline ADR 0004 documents as unbuilt) — this ADR's
model choice is real and tested at the `EmbeddingService` layer, just not yet exercised
end-to-end against a real populated index.
