from __future__ import annotations

from dataclasses import dataclass

from app.application.auth.token_issuer import TokenPair, issue_token_pair
from app.core.config import Settings
from app.core.errors import AuthError
from app.core.security import hash_password, verify_password
from app.domain.ports.user_repository import UserRepository
from app.infrastructure.db.repositories.auth_repository import AuthRepository

# A fixed bcrypt hash checked when no matching user exists, so a nonexistent email still costs a
# real bcrypt.checkpw() call — without this, "user not found" would return faster than "wrong
# password", which is itself a (timing) leak of whether an email is registered.
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-constant-time-login-failures")


@dataclass(frozen=True, slots=True)
class LoginRequest:
    email: str
    password: str


class LoginUseCase:
    def __init__(self, user_repo: UserRepository, auth_repo: AuthRepository, settings: Settings) -> None:
        self._user_repo = user_repo
        self._auth_repo = auth_repo
        self._settings = settings

    async def execute(self, request: LoginRequest) -> TokenPair:
        user = await self._user_repo.get_by_email(request.email)

        # Same error for "no such user", "OAuth-only account" (no password set), and "wrong
        # password" — AUTHENTICATION.md's own acceptance criterion: don't leak which case it was.
        if user is None or user.hashed_password is None:
            verify_password(request.password, _DUMMY_PASSWORD_HASH)
            raise AuthError("Invalid email or password")
        if not verify_password(request.password, user.hashed_password):
            raise AuthError("Invalid email or password")
        if not user.is_active:
            raise AuthError("Account is inactive")

        return await issue_token_pair(user, self._auth_repo, self._settings)
