# apps/backend/tests/integration/infrastructure/

Integration tests for infrastructure implementations against real external services.

Key scenarios:
- All repository CRUD operations on real PostgreSQL
- pgvector HNSW search returns correct nearest neighbors
- Redis pub/sub delivers messages to subscribers
- `CacheService.set()` + `get()` with TTL (advance time to verify expiry)
- Alembic migration round-trip: `upgrade head` → `downgrade base` → `upgrade head` (all succeed)
- `EmbeddingService.embed()` with real Ollama (if available in test environment; skip if not)
