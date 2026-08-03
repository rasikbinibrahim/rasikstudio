# apps/backend/tests/unit/core/

Unit tests for cross-cutting concerns.

Key scenarios:
- `security.py`: JWT encode → decode round-trip with correct claims
- `security.py`: expired JWT raises `AuthError` (use `freezegun`)
- `security.py`: tampered JWT signature raises `AuthError`
- `security.py`: AES-256-GCM encrypt → decrypt round-trip equals original
- `security.py`: two encryptions of the same plaintext produce different ciphertexts (random IV)
- `security.py`: bcrypt hash → verify succeeds; wrong password fails
- `config.py`: missing required env var raises `ValidationError` at startup
- `errors.py`: each error type serializes to the correct HTTP status and error schema
