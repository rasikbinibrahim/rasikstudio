# ADR 0005: WebSocket Authentication — First Message, Not Query Parameter

## Status

Accepted (2026-08-03)

## Context

The WebSocket gateway (`WS /ws/{workspace_id}`) needs to authenticate the connecting user. The
two common patterns are: pass the JWT as a query parameter (`?token=...`) at connection time, or
accept the connection unauthenticated and require a first message containing the token before
allowing anything else.

## Decision

First-message authentication: the connection is accepted, then the gateway waits for a
`{"type": "auth", "token": "..."}` message; anything else, or a timeout, closes the connection
with code 4401.

## Rationale

- **Query-parameter tokens leak.** URLs (including query strings) routinely end up in server
  access logs, browser history, and proxy logs — a JWT in a query parameter is a real credential
  exposure surface a request body/message payload doesn't have.
- **Symmetric with the HTTP auth pattern** (`Authorization: Bearer <token>` header, never a query
  parameter) already used everywhere else in this API.

## Alternatives Considered

- **Query parameter** (`?token=...`) — simplest to implement, but the logging-exposure risk above
  is a real, not hypothetical, security concern for a token with the same authority as the
  `Authorization` header.
- **Custom `Sec-WebSocket-Protocol` header token** — avoids the logging issue but is a more
  obscure convention with worse client-library ergonomics than a plain first message.

## Consequences

- The gateway must track a short "awaiting auth" state per connection and enforce a timeout
  (an unauthenticated connection that never sends anything must eventually be closed, not held
  open indefinitely) — real implementation complexity a query-parameter approach wouldn't have
  needed.
- Every WebSocket client (the desktop app's `ws-client.ts`) must implement the two-step
  connect-then-authenticate handshake rather than a single connect-with-token call.

## Outcome

Confirmed correct and fully implemented since Phase 7. `api/ws/gateway.py`'s real behavior: valid
auth is accepted, invalid/expired/missing auth closes with code 4401 (verified by a real
integration test using a `live_server` fixture — a real `uvicorn.Server` + the `websockets`
client library, not `TestClient`, since `TestClient`'s WebSocket support runs in a separate event
loop incompatible with the async SQLAlchemy engine — see the Decisions Log). One real, still-open
gap: the 30-second idle-connection timeout is implemented (`IDLE_TIMEOUT_SECONDS` in
`gateway.py`) but has never been test-verified, since verifying it for real would need either a
30+ second test or making the timeout constructor-injectable, and neither has been done —
tracked in `TASKS.md`.
