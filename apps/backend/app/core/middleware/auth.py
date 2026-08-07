from __future__ import annotations

from typing import Any

import jwt

from app.core.config import Settings
from app.core.errors import AuthError
from app.core.security import decode_access_token


def decode_bearer_token(token: str, settings: Settings) -> dict[str, Any]:
    """Pure JWT decode/validate — no DB access, so this stays a real `core/` file per
    `app/README.md`'s layer rules (unlike `core/dependencies.py`'s `get_current_user()`, which
    also loads the user and is documented there as the one exception). Raises `AuthError`, not the
    raw PyJWT exception, so every caller gets the same `{code, message}` shape regardless of which
    of PyJWT's several exception subclasses fired."""
    try:
        return decode_access_token(token, settings)
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Access token has expired", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid access token", code="invalid_token") from exc
