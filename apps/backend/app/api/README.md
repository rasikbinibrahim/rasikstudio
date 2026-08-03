# apps/backend/app/api/

Transport layer — FastAPI routers and Pydantic request/response schemas. This layer handles HTTP and WebSocket I/O. It contains no business logic.

## Subdirectories

| Directory | Purpose |
|---|---|
| `v1/` | REST API version 1 routers |
| `ws/` | WebSocket gateway |

## Rules

- Routers call use case classes from `application/` — they do not contain business logic.
- Request schemas validate and parse incoming data.
- Response schemas serialize outgoing data.
- No direct database queries in router functions — always go through `application/`.
- Authentication is handled by the `get_current_user()` dependency, not inline in each router.
- All routers are mounted in `app/main.py` via the versioned prefix `/api/v1`.
