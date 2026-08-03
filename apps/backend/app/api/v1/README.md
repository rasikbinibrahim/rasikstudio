# apps/backend/app/api/v1/

REST API version 1 route handlers. Each file is one domain. All routes under `/api/v1/`.

## Files (to be created across Phases 4–14)

| File | Route Prefix | Phase |
|---|---|---|
| `health.py` | `/health` | 4 |
| `auth.py` | `/auth` | 6 |
| `workspaces.py` | `/workspaces` | 4 |
| `files.py` | `/files` | 4 |
| `chat.py` | `/chat` | 10 |
| `agents.py` | `/agents` | 8 |
| `git.py` | `/git` | 12 |
| `models.py` | `/models` | 9 |
| `search.py` | `/search` | 10 |
| `settings.py` | `/settings` | 4 |
| `__init__.py` | — | 4 — master APIRouter including all above |

## Response Format

All error responses use the standard schema:
```json
{
  "error": {
    "code": "string_slug",
    "message": "Human-readable description",
    "request_id": "uuid"
  }
}
```

All list endpoints use keyset pagination (cursor-based), not offset.
