from __future__ import annotations

import base64
import hashlib
import platform
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import Settings

BCRYPT_WORK_FACTOR = 12
AES_IV_BYTES = 12
REFRESH_TOKEN_BYTES = 32


# ---------------------------------------------------------------------------
# Passwords (bcrypt)
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=BCRYPT_WORK_FACTOR)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# JWT access tokens
# ---------------------------------------------------------------------------


def create_access_token(*, user_id: uuid.UUID, email: str, settings: Settings) -> str:
    """Claims per AUTHENTICATION.md §3: sub, email, iat, exp, jti (jti prevents replay confusion
    between two tokens issued in the same second, not full anti-replay — access tokens are
    intentionally stateless/unrevokable, see §3's "not stored in DB")."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    """Raises `jwt.ExpiredSignatureError` / `jwt.InvalidTokenError` (or a subclass) on failure —
    callers (see core/middleware/auth.py) translate those into `AuthError`."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


# ---------------------------------------------------------------------------
# Refresh tokens (opaque, hashed at rest)
# ---------------------------------------------------------------------------


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    """SHA-256 (not bcrypt) — the token is already a 256-bit random value, not a low-entropy
    human password, so a slow KDF buys nothing; a fast, deterministic hash is what lets
    `AuthRepository.get_by_hash()` look it up by equality instead of checking every stored row."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# AES-256-GCM (workspace AI-provider API key encryption)
# ---------------------------------------------------------------------------


def encrypt_secret(plaintext: str, settings: Settings) -> str:
    """Storage format per AUTHENTICATION.md §5: base64(iv + ciphertext_with_tag)."""
    iv = secrets.token_bytes(AES_IV_BYTES)
    cipher = AESGCM(settings.encryption_key.encode())
    ciphertext = cipher.encrypt(iv, plaintext.encode(), None)
    return base64.b64encode(iv + ciphertext).decode()


def decrypt_secret(stored: str, settings: Settings) -> str:
    data = base64.b64decode(stored)
    iv, ciphertext = data[:AES_IV_BYTES], data[AES_IV_BYTES:]
    cipher = AESGCM(settings.encryption_key.encode())
    return cipher.decrypt(iv, ciphertext, None).decode()


# ---------------------------------------------------------------------------
# Local-first machine identity (AUTHENTICATION.md §10)
# ---------------------------------------------------------------------------


def generate_machine_id() -> str:
    """Deterministic per-machine identifier used when no account exists — the same machine always
    derives the same id, with no account, network call, or stored credential. Prefers the OS's own
    stable machine identifier (`/etc/machine-id` on Linux) over `uuid.getnode()`, which is MAC-
    address-based and can change across network interfaces or VMs."""
    machine_id_file = Path("/etc/machine-id")
    if machine_id_file.exists():
        raw = machine_id_file.read_text().strip()
    else:
        raw = f"{platform.node()}-{uuid.getnode()}"
    return hashlib.sha256(raw.encode()).hexdigest()
