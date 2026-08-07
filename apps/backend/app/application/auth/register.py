from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from app.application.auth.token_issuer import TokenPair, issue_token_pair
from app.core.config import Settings
from app.core.errors import ValidationError
from app.core.security import hash_password
from app.domain.models.user import User
from app.domain.ports.user_repository import UserRepository
from app.infrastructure.db.repositories.auth_repository import AuthRepository

MIN_PASSWORD_LENGTH = 8  # AUTHENTICATION.md §4


@dataclass(frozen=True, slots=True)
class RegisterRequest:
    email: str
    password: str
    name: str


class RegisterUseCase:
    def __init__(self, user_repo: UserRepository, auth_repo: AuthRepository, settings: Settings) -> None:
        self._user_repo = user_repo
        self._auth_repo = auth_repo
        self._settings = settings

    async def execute(self, request: RegisterRequest) -> TokenPair:
        if len(request.password) < MIN_PASSWORD_LENGTH:
            raise ValidationError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

        existing = await self._user_repo.get_by_email(request.email)
        if existing is not None:
            # 409, not the ValidationError default of 422 — API_SPECIFICATION.md §11 categorizes
            # "duplicate email" as a conflict, and 409 is the more specific/correct status for it.
            raise ValidationError("Email is already registered", code="email_taken", status_code=409)

        now = datetime.now(UTC)
        user = await self._user_repo.create(
            User(
                id=uuid4(),
                email=request.email,
                name=request.name,
                avatar_url=None,
                auth_provider="local",
                hashed_password=hash_password(request.password),
                is_active=True,
                settings={},
                created_at=now,
                updated_at=now,
            )
        )
        return await issue_token_pair(user, self._auth_repo, self._settings)
