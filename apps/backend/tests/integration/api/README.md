# apps/backend/tests/integration/api/

Integration tests for all REST API endpoints using `httpx.AsyncClient` against a real FastAPI app with real PostgreSQL and Redis.

Key flows to test:
- Full auth flow: register → login → access protected endpoint → refresh → logout
- Refresh token reuse detection end-to-end
- Chat session create → send message → verify message in DB
- Agent task create → step via WebSocket event subscription → verify steps in DB
- Rate limit: 11th login request returns 429
- CORS: request from unlisted origin returns 403
- Path traversal attempt via file API returns 422 with `SecurityError`
