from __future__ import annotations

from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.user import AuthProvider, User
from app.infrastructure.db.models.base import Base, TimestampMixin


class UserModel(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    avatar_url: Mapped[str | None] = mapped_column(String)
    auth_provider: Mapped[str] = mapped_column(String, default="local")
    hashed_password: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    def to_domain(self) -> User:
        return User(
            id=self.id,
            email=self.email,
            name=self.name,
            avatar_url=self.avatar_url,
            auth_provider=cast(AuthProvider, self.auth_provider),
            hashed_password=self.hashed_password,
            is_active=self.is_active,
            settings=self.settings,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )
