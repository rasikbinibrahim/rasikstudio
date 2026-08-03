# apps/backend/app/core/middleware/

FastAPI middleware classes applied to every request in the defined order.

## Files (to be created in Phase 4 and Phase 6)

| File | Order | Purpose |
|---|---|---|
| `cors.py` | 1 | CORS headers — allows only configured origins |
| `request_logger.py` | 2 | Assigns `request_id` (UUID), logs method/path/status/duration |
| `auth.py` | 3 | Extracts and validates JWT from `Authorization: Bearer` header |
| `rate_limiter.py` | 4 | slowapi rate limiting (per-IP and per-user limits) |

## Middleware Order

Middleware is applied in reverse registration order by Starlette. Register them so that `cors` executes first on the request path. The order listed above is the execution order seen by an incoming request.

## Request ID

Every request gets a UUID `request_id` stored in `request.state.request_id` by `request_logger.py`. This ID appears in every log line for the request and in the response header `X-Request-ID`. Use it to correlate frontend errors with backend logs.
