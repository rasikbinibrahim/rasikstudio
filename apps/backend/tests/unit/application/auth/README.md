# apps/backend/tests/unit/application/auth/

Unit tests for authentication use cases.

Key scenarios:
- `RegisterUseCase`: creates user with bcrypt-hashed password, issues tokens
- `RegisterUseCase`: duplicate email returns same error as invalid email (no user existence leak)
- `LoginUseCase`: correct credentials return token pair
- `LoginUseCase`: wrong password returns `AuthError` (timing-safe — use `freezegun` to verify constant time)
- `RefreshTokenUseCase`: valid token returns new pair, revokes old hash
- `RefreshTokenUseCase`: presenting the already-revoked token triggers reuse detection (revoke all user tokens)
- Token expiry: use `freezegun` to advance time past 30 minutes and verify access token is rejected
