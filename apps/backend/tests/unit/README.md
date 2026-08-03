# apps/backend/tests/unit/

Pure unit tests. No external services, no database, no network. Run in milliseconds with zero infrastructure.

## What to Mock

- Repository ports — use a simple in-memory `FakeRepository` or `MagicMock`
- AI providers — mock `AIProvider.complete()` to return predetermined `StreamChunk` sequences
- Redis — use `fakeredis` for cache service tests
- File system — use `tmp_path` pytest fixture or `aiofiles` mock

## What NOT to Mock

- Domain models and domain services — these are pure Python, no mocking needed
- `core/security.py` cryptographic functions — test with real inputs/outputs

## Fixtures (conftest.py)

Define shared fixtures at the `tests/unit/` level for:
- Fake repository implementations
- Sample domain model instances
- Mock AI provider that streams a fixed response
