# Authentication — API Consumer Guide

Practical "how do I call this API" reference. For the full design (password hashing, JWT
internals, encryption-at-rest for provider API keys, the complete security checklist), see the
root `AUTHENTICATION.md` — this file doesn't repeat that, it's the condensed path for someone
integrating against the running API.

## Getting a token: local email/password

```
POST /api/v1/auth/register   { "email": "...", "password": "...", "name": "..." }
POST /api/v1/auth/login      { "email": "...", "password": "..." }
```

Both return:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

Use the access token as `Authorization: Bearer <access_token>` on every authenticated request.
It's short-lived (30 minutes by default — `Settings.access_token_expire_minutes`); the refresh
token (30 days by default) is what you use to get a new one without asking the user to log in
again.

## Refreshing

```
POST /api/v1/auth/refresh   { "refresh_token": "..." }
```

Returns a **new** access token *and* a new refresh token — refresh tokens rotate on every use.
The old refresh token is immediately invalidated. If an already-rotated (dead) refresh token is
presented again, the server treats this as a compromise signal and revokes the entire token
family (every token descended from that original login) — the desktop app's `token_reuse_detected`
error code (see `ERROR_CODES.md`) is what that looks like from the client side.

## Logging out

```
POST /api/v1/auth/logout   (Authorization: Bearer <access_token>)
```

Revokes the current refresh token. The access token itself isn't revocable (JWTs are stateless
by design) — it simply expires within `access_token_expire_minutes`.

## OAuth (GitHub / Google)

```
GET /api/v1/auth/oauth/{provider}                       → redirects to the provider's consent screen
GET /api/v1/auth/oauth/{provider}/callback?code=&state= → provider redirects back here with a code
```

`{provider}` is `github` or `google`. The initiating request stores a CSRF `state` nonce
server-side (Redis, 10-minute TTL); the callback requires both `code` and `state`, verifies+
consumes the latter (single-use — a replayed or unrecognized `state` fails with `401 auth_error`
before any token exchange happens), then exchanges the provider's code for a session and returns
the same `access_token`/`refresh_token` pair as local login.

**Real, honest status as of Phase 16:** the exchange logic is fully built and unit-tested against
a mocked HTTP transport. The literal live round-trip against a real registered OAuth app has
never been exercised — that needs real client id/secret credentials, an account/cost decision
this repository can't provision on its own (same category as the deployment pipeline's macOS
notarization gap). If you're setting this up for real, this is the first thing to manually verify
once you have real OAuth app credentials configured.

## WebSocket authentication

The WebSocket gateway (`WS /ws/{workspace_id}`) does **not** accept a token as a query parameter
— see ADR 0005 for why (URL-embedded tokens leak into logs). Connect, then send the access token
as your first message:

```json
{ "type": "auth", "token": "eyJ..." }
```

The server replies `{"type": "connected", ...}` on success. Any other first message, or a missing
one, closes the connection with code `4401`. Full event catalog: `WEBSOCKET_EVENTS.md`.

## Token contents (for debugging, not for building custom validation logic against)

Access tokens are HS256 JWTs signed with `Settings.secret_key`. Don't hand-parse them
client-side to make authorization decisions — the backend is the only source of truth for
whether a token is currently valid (it checks the DB-backed refresh-token family for revocation,
which a JWT's own signature can't express).
