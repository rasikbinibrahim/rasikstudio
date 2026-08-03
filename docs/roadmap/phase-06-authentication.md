# Phase 6 — Authentication

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 5
**Estimated effort:** 2 weeks

---

## Objective

Implement the complete authentication system: registration, login, JWT access tokens, refresh token rotation with reuse detection, AES-256-GCM API key encryption, OAuth2 (GitHub and Google), and all authentication middleware. By the end of this phase, the API is secured and the desktop app can authenticate users.

## Architecture

**Authentication modes:**
1. **Local-first** — machine ID as identity, no credentials required (default for solo use)
2. **Cloud** — email/password registration + JWT, or OAuth2 (GitHub/Google)

**Token lifecycle:**
```
Login → issue access_token (JWT, 30min) + refresh_token (opaque, 30 days)
      → store SHA-256(refresh_token) in refresh_tokens table

Access token expires → client sends refresh_token
                    → server validates hash, issues new pair, revokes old token
                    → if old refresh token is presented again → revoke entire family
```

**JWT claims:** `sub` (user_id), `email`, `iat`, `exp`, `jti` (prevents replay within lifetime)

**API key encryption:** AES-256-GCM with 12-byte random IV per encryption operation. Stored as `base64(iv + ciphertext + tag)`. Decrypted in memory only, never returned to client.

**WebSocket authentication:** first-message auth (the JWT is sent as the first message after connection), not a query parameter (see ADR 0005).

**Rate limiting (slowapi):**
- Login: 10 req/min per IP
- Register: 5 req/min per IP
- Refresh: 20 req/min per user_id
- OAuth callback: 10 req/min per IP

## Dependencies

- Phase 5 complete (users, refresh_tokens tables)
- `PyJWT[cryptography]`
- `bcrypt`
- `cryptography` (AES-256-GCM)
- `httpx` (OAuth2 token exchange)
- `slowapi`

## Files to Create

**Core security:**
- `app/core/security.py` — JWT encode/decode, bcrypt hash/verify, AES-256-GCM encrypt/decrypt, machine-id generator

**Application use cases:**
- `app/application/auth/register.py` — `RegisterUseCase`
- `app/application/auth/login.py` — `LoginUseCase`
- `app/application/auth/refresh.py` — `RefreshTokenUseCase`
- `app/application/auth/logout.py` — `LogoutUseCase`
- `app/application/auth/oauth.py` — `OAuthCallbackUseCase` (GitHub + Google)

**API routes:**
- `app/api/v1/auth.py` — all auth endpoints (register, login, refresh, logout, /me, OAuth routes)

**Middleware:**
- `app/core/middleware/auth.py` — extracts + validates JWT, sets `request.state.user`
- `app/core/dependencies.py` — add `get_current_user()`, `get_optional_user()` dependencies

**Infrastructure:**
- `app/infrastructure/db/repositories/auth_repository.py` — refresh token CRUD + reuse detection

## Files to Modify

- `app/api/v1/__init__.py` — include auth router
- `app/core/config.py` — add JWT and encryption settings
- `app/api/ws/gateway.py` — implement first-message auth

## Acceptance Criteria

- [ ] `POST /api/v1/auth/register` creates a user and returns tokens
- [ ] `POST /api/v1/auth/login` with correct credentials returns access + refresh tokens
- [ ] `POST /api/v1/auth/login` with wrong password returns HTTP 401 (not 404 — don't leak user existence)
- [ ] Access token expires after 30 minutes (use `freezegun` to verify)
- [ ] `POST /api/v1/auth/refresh` with valid refresh token returns new token pair and revokes old token
- [ ] Re-presenting the old refresh token after rotation returns HTTP 401 and revokes all user tokens (reuse detection)
- [ ] JWT in Authorization header (Bearer) is validated on protected endpoints
- [ ] Expired JWT returns HTTP 401 with `code: "token_expired"`
- [ ] AES-256-GCM round-trip: encrypt a test string, decrypt it, verify equality
- [ ] Two encryptions of the same plaintext produce different ciphertexts (random IV)
- [ ] Login rate limit: 11th request within 60 seconds returns HTTP 429
- [ ] `GET /api/v1/auth/me` returns current user data when authenticated
- [ ] OAuth2 GitHub flow completes (manual test with real GitHub app)
- [ ] `mypy app/core/security.py` passes with zero errors
- [ ] No plaintext passwords or API keys appear in any log line

## Testing Strategy

- **Unit tests:** JWT encode/decode (expiry, invalid signature, wrong algorithm), bcrypt (hash + verify), AES-256-GCM (round-trip, random IV), reuse detection logic
- **Integration tests:** Full auth flow with real DB (testcontainers): register → login → refresh → logout; reuse detection test
- **Security test:** `freezegun` for token expiry; attempt to use access token as refresh token (must fail)

## Estimated Effort

**2 weeks**
- Week 1: JWT, bcrypt, AES-256-GCM implementation, register/login endpoints, middleware
- Week 2: Refresh rotation, reuse detection, OAuth2, rate limiting, tests
