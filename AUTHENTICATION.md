# Authentication — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

Rasik Studio supports two auth modes:

1. **Local-first (default):** No account required. The app runs fully offline. Settings and history are stored locally only.
2. **Cloud account:** Optional. Enables settings sync, workspace sharing, and cloud AI model access. Uses JWT + OAuth2.

---

## 2. Authentication Flow

### 2.1 Local (Username/Password)

```
Client                    FastAPI                    PostgreSQL
  │                          │                           │
  │── POST /auth/login ──────►│                           │
  │   {email, password}       │── SELECT user ────────────►│
  │                          │◄── user row ───────────────│
  │                          │   verify bcrypt hash       │
  │                          │   generate access_token    │
  │                          │   generate refresh_token   │
  │                          │── INSERT refresh_token ────►│
  │◄── {access_token,        │                           │
  │     refresh_token} ───────│                           │
```

### 2.2 OAuth2 (GitHub / Google)

```
Client                    FastAPI                    GitHub/Google
  │                          │                           │
  │── GET /auth/oauth/github ►│                           │
  │◄── redirect ─────────────│                           │
  │                          │                           │
  │── GET github.com/login   ─────────────────────────────►│
  │◄── auth code ────────────────────────────────────────│
  │                          │                           │
  │── GET /auth/oauth/github/callback?code=... ──────────►│
  │                          │── exchange code ──────────►│
  │                          │◄── access_token ──────────│
  │                          │── GET /user (profile) ────►│
  │                          │◄── {email, name, avatar} ─│
  │                          │   upsert user in DB        │
  │                          │   issue JWT pair           │
  │◄── {access_token,        │                           │
  │     refresh_token} ───────│                           │
```

### 2.3 Token Refresh

```
Client                    FastAPI
  │                          │
  │── POST /auth/refresh ────►│
  │   {refresh_token}         │  verify token_hash in DB
  │                          │  check not revoked, not expired
  │                          │  revoke old refresh_token (rotation)
  │                          │  issue new access_token + refresh_token
  │◄── {access_token,        │
  │     refresh_token} ───────│
```

---

## 3. JWT Design

### Access Token

- Algorithm: `HS256` (or `RS256` in production with key rotation)
- Expiry: 30 minutes
- Claims:
  ```json
  {
    "sub": "user-uuid",
    "email": "user@example.com",
    "iat": 1754000000,
    "exp": 1754001800,
    "jti": "unique-token-id"
  }
  ```
- Stateless — not stored in DB.
- Sent as `Authorization: Bearer <token>`.

### Refresh Token

- Opaque random token (32 bytes, URL-safe base64).
- Stored as SHA-256 hash in `refresh_tokens` table.
- Expiry: 30 days.
- **Rotation:** Every refresh call issues a new pair and revokes the old one.
- **Reuse detection:** If a revoked token is presented, all tokens for that user are revoked immediately (family compromise detection).

---

## 4. Password Security

- Hashing: `bcrypt` with work factor 12.
- Minimum password requirements: 8 characters, enforced at API level.
- Passwords are never logged or returned in responses.
- Password reset via email (token-based, 1-hour expiry) — Phase 6+ feature.

---

## 5. API Key Encryption

User-provided AI provider API keys (OpenAI, Anthropic, Gemini) are encrypted before storage.

**Scheme:**
- Algorithm: AES-256-GCM (authenticated encryption).
- Master encryption key: loaded from environment variable `ENCRYPTION_KEY` (32-byte secret, never in code).
- IV: random 12 bytes, stored alongside ciphertext (prepended).
- Storage format: `base64(iv + ciphertext + tag)`.

```python
def encrypt_key(plaintext: str, master_key: bytes) -> str:
    iv = os.urandom(12)
    cipher = AESGCM(master_key)
    ciphertext = cipher.encrypt(iv, plaintext.encode(), None)
    return base64.b64encode(iv + ciphertext).decode()

def decrypt_key(stored: str, master_key: bytes) -> str:
    data = base64.b64decode(stored)
    iv, ciphertext = data[:12], data[12:]
    cipher = AESGCM(master_key)
    return cipher.decrypt(iv, ciphertext, None).decode()
```

The decrypted key is used in-memory only for API calls and never returned to the client.

---

## 6. Auth Middleware

Every protected route goes through `get_current_user`:

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except ExpiredSignatureError:
        raise AuthError("Token expired")
    except JWTError:
        raise AuthError("Invalid token")
    
    user = await user_repo.get_by_id(db, UUID(payload["sub"]))
    if not user or not user.is_active:
        raise AuthError("User not found or inactive")
    return user
```

---

## 7. WebSocket Authentication

WebSocket connections cannot send HTTP headers after upgrade. Two ways exist to authenticate one anyway:

1. **Query parameter:** `WS /ws/{workspace_id}?token=<jwt>` — simple, but the token ends up in server access logs, browser history, and any `Referer` header a proxy forwards.
2. **First message:** client sends `{"type": "auth", "token": "<jwt>"}` as the first WebSocket message, before the server treats the connection as authenticated.

Option 2 is used (see ADR 0005 — its title is literally "websocket-auth-first-message" — and `docs/roadmap/phase-06-authentication.md`/`phase-07-websocket-gateway.md`, which both specify first-message auth explicitly). This section previously said "Option 1 is used," contradicting all of those; that was a documentation error, not a design change — fixed here rather than left to drift further.

---

## 8. Rate Limiting

Auth endpoints are rate-limited to prevent brute force:

| Endpoint | Limit | Window |
|---|---|---|
| `/auth/login` | 10 requests | 1 minute per IP |
| `/auth/register` | 5 requests | 1 minute per IP |
| `/auth/refresh` | 20 requests | 1 minute per user |

Implemented via `slowapi` (Redis-backed). Exceeding the limit returns `429 Too Many Requests`.

---

## 9. Session Management

- Access tokens are short-lived (30 min) and stateless.
- Refresh tokens are long-lived (30 days) and stored in DB.
- On logout: refresh token is immediately revoked in DB.
- On password change: all refresh tokens for the user are revoked.
- On account deactivation: all tokens are revoked.

---

## 10. Local-First Mode

When the user has not created an account:
- No JWT is issued.
- The backend uses a "local user" identity derived from the machine ID.
- All data is stored in the local PostgreSQL instance.
- Cloud features (settings sync, OAuth cloud models) are unavailable until the user creates an account and links it.

---

## 11. Security Checklist

Auth-specific verification items (bcrypt work factor, JWT expiry, refresh rotation, reuse detection, rate limiting) are already summarized in `SECURITY_GUIDELINES.md §5` and API key encryption in `§6` — nothing auth-specific is tracked separately here to avoid the two documents drifting apart. The one item unique to this document, cookie flags for a future web client, is folded into `SECURITY_GUIDELINES.md §10` instead.
