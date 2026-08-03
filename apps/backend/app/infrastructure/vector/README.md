# apps/backend/app/infrastructure/vector/

pgvector embedding store — implements the `VectorStore` port for both code embeddings and workspace memories.

## Files (to be created in Phase 5 and Phase 8)

| File | Purpose |
|---|---|
| `pgvector_store.py` | `PgVectorStore` — upsert, cosine search, delete by file path |
| `hnsw_config.py` | HNSW index parameters: `m=16`, `ef_construction=64`, `ef_search=40` |

## Search Configuration

```sql
-- HNSW index (created in Alembic migration)
CREATE INDEX CONCURRENTLY idx_code_embeddings_hnsw
ON code_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Query uses ef_search for recall/speed tradeoff
SET hnsw.ef_search = 40;
SELECT * FROM code_embeddings
ORDER BY embedding <=> $1 LIMIT 20;
```

## Dimension Lock

All embeddings in the database must be 768-dimensional (nomic-embed-text). Changing the embedding model requires dropping and rebuilding all embeddings — there is no partial migration path. The active embedding model version is stored in the workspace settings so mismatches can be detected.
