# apps/backend/tests/

All test suites for the Rasik Studio backend.

## Structure

| Directory | Framework | Dependencies |
|---|---|---|
| `unit/` | pytest | No external services — pure Python |
| `integration/` | pytest + testcontainers | Real PostgreSQL + Redis via Docker |

## Naming Convention

Test file paths mirror source file paths exactly:

```
app/infrastructure/ai/ollama_provider.py  →  tests/unit/infrastructure/ai/test_ollama_provider.py
app/application/auth/login.py             →  tests/unit/application/auth/test_login.py
app/api/v1/chat.py                        →  tests/integration/api/test_chat.py
```

## Coverage Targets

| Area | Target |
|---|---|
| Overall backend | ≥ 85% |
| Agent tools | ≥ 90% |

## Running Tests

```bash
# All tests
make test

# Unit only (fast, no Docker needed)
pytest tests/unit/

# Integration only (requires Docker)
pytest tests/integration/

# With coverage report
pytest --cov=app --cov-report=html
```
