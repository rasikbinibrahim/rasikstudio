# Error Codes

Every domain error response has the shape:

```json
{
  "error": {
    "code": "auth_error",
    "message": "Human-readable explanation",
    "request_id": "a uuid, also present in the response's X-Request-ID header and structured logs"
  }
}
```

`request_id` is what to ask a user for when debugging a real report — `structlog`'s request
middleware tags every log line for that request with the same id.

**Source of truth:** `apps/backend/app/core/errors.py` (the `RasikStudioError` hierarchy) and the
specific `code="..."` overrides raised throughout `app/application/*`. This table was generated
by grepping every real `code="..."` string in the codebase, not written from a spec.

## Error families (`RasikStudioError` subclasses, each with a default `code`/HTTP status)

| Code | HTTP Status | Meaning |
|---|---|---|
| `auth_error` | 401 | Authentication failed or required |
| `workspace_error` | 404 | Workspace not found or not yours (don't-leak-existence — a workspace owned by someone else 404s, never 403) |
| `ai_error` | 502 | An AI provider call failed in a way not covered by a more specific `AIError` subclass below |
| `model_unavailable` | 503 | The provider is unreachable/unhealthy — `ModelRouter` catches this specifically to advance its fallback chain |
| `model_rate_limited` | 429 | The provider rate-limited this request |
| `context_window_exceeded` | 422 | Truncation still left the request over the model's context budget (e.g. one message alone is larger than the whole window) |
| `provider_auth_error` | 502 | The AI provider rejected our API key — distinct from `auth_error`, which is about *this app's* user sessions |
| `storage_error` | 500 | A storage-layer failure |
| `agent_error` | 404 (default; some paths override to 409 — see below) | Agent-task-lifecycle errors |
| `validation_error` | 422 | Request validation failed |
| `chat_error` | 404 | Chat-session-lifecycle errors (don't-leak-existence, same as `workspace_error`) |

## Specific codes raised with an explicit override (not just the family default)

| Code | Where | Meaning |
|---|---|---|
| `token_expired` | Auth | Access token's `exp` has passed — the desktop client automatically retries with the refresh token |
| `invalid_token` | Auth | Token is malformed or fails signature verification |
| `missing_token` | Auth | No `Authorization` header present |
| `token_reuse_detected` | Auth | A refresh token was reused after already being rotated — treated as a compromise signal, revokes the whole token family |
| `email_taken` | Auth (register) | Email already has an account |
| `agent_task_not_found` | Agents | Task doesn't exist or isn't yours |
| `agent_task_not_paused` | Agents (`approve`) | 409 — tried to approve/reject a task that isn't actually waiting on a decision |
| `agent_task_not_active` | Agents (`cancel`) | 409 — tried to cancel a task that already finished |
| `agent_task_already_finished` | Agents | 409 — a state-transition attempted on a task past the point where it applies |
| `unknown_agent_type` | Agents (`create`) | The requested agent type isn't one of the registered agents (`coder`, `debugger`, `researcher`, etc.) |
| `unknown_model` | Models / chat | The requested model id isn't in `ModelRouter`'s known catalog |
| `workspace_not_found` | Workspaces | Explicit override of the family default, same don't-leak-existence 404 |
| `empty_diff` | Git | `generate-commit-message` called with nothing staged |
| `empty_completion` | Chat/Agents | A provider returned an empty response body |
| `rate_limited` | Global middleware | This app's own rate limiter (`slowapi`), not a provider's — see `rate_limit_default` in `Settings` |
| `validation_error` | Global | FastAPI/Pydantic request validation failure, funneled through the same envelope as domain errors |
| `internal_error` | Global | Unhandled exception — the catch-all `RasikStudioError` default, never intentionally raised directly |

## Unmapped errors

Any exception that isn't a `RasikStudioError` (a real bug, not a domain error) is still returned
in the same envelope shape (`code: "internal_error"`, `status_code: 500`) by the global exception
handler — the response never leaks a raw traceback, but the real exception is logged
server-side with the same `request_id` for correlation.
