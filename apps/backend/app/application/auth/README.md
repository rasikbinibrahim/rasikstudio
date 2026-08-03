# apps/backend/app/application/auth/

Authentication use cases.

## Files (to be created in Phase 6)

| File | Use Case | Description |
|---|---|---|
| `register.py` | `RegisterUseCase` | Validate email uniqueness, hash password with bcrypt, issue tokens |
| `login.py` | `LoginUseCase` | Verify credentials, issue access + refresh token pair |
| `refresh.py` | `RefreshTokenUseCase` | Validate refresh token hash, rotate (issue new pair, revoke old) |
| `logout.py` | `LogoutUseCase` | Revoke the presented refresh token |
| `oauth.py` | `OAuthCallbackUseCase` | Exchange OAuth code for user info, upsert user, issue tokens |

## Security Notes

- `LoginUseCase` must use `bcrypt.checkpw()` — timing-safe comparison.
- On refresh token reuse detection (old token presented after rotation): revoke ALL tokens for the user family, not just the presented token.
- `RegisterUseCase` returns the same error for "email taken" as for any other validation error — do not leak user existence.
