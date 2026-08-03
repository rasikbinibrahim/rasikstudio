# apps/backend/tests/unit/infrastructure/db/

Unit tests for ORM model mappings and repository logic that can be isolated with an in-memory approach.

Note: Most repository tests belong in `tests/integration/` because they require real PostgreSQL + pgvector. Tests here cover: model `to_domain()` conversion methods, query builder logic (constructed SQL, not executed), and ORM model validation.
