from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.workspace import ApiKeyProvider, Workspace, WorkspaceApiKey
from app.infrastructure.db.models.base import Base, TimestampMixin


class WorkspaceModel(Base, TimestampMixin):
    __tablename__ = "workspaces"
    __table_args__ = (
        # Makes `POST /workspaces`'s idempotent-by-(user_id, root_path) behavior race-proof —
        # previously enforced only by an application-layer lookup-before-insert
        # (`GetOrCreateWorkspaceUseCase`), which two concurrent requests could both pass.
        UniqueConstraint("user_id", "root_path", name="uq_workspaces_user_root_path"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String)
    root_path: Mapped[str] = mapped_column(Text)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    last_opened_at: Mapped[datetime | None] = mapped_column()

    def to_domain(self) -> Workspace:
        return Workspace(
            id=self.id,
            user_id=self.user_id,
            name=self.name,
            root_path=self.root_path,
            settings=self.settings,
            last_opened_at=self.last_opened_at,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


# DATABASE_DESIGN.md specifies `last_opened_at DESC` (workspace list is sorted most-recent-first)
# — SQLAlchemy's declarative `Index()` needs the mapped column's own `InstrumentedAttribute` to
# express per-column sort order, which only exists once the class body above has finished
# executing, so this can't live in `__table_args__` alongside the plain-column indexes there.
Index(
    "idx_workspaces_last_opened",
    WorkspaceModel.user_id,
    WorkspaceModel.last_opened_at.desc(),
)


class WorkspaceApiKeyModel(Base):
    __tablename__ = "workspace_api_keys"
    __table_args__ = (UniqueConstraint("workspace_id", "provider", name="idx_api_keys_workspace_provider"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String)
    encrypted_key: Mapped[str] = mapped_column(Text)
    key_hint: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def to_domain(self) -> WorkspaceApiKey:
        return WorkspaceApiKey(
            id=self.id,
            workspace_id=self.workspace_id,
            provider=cast(ApiKeyProvider, self.provider),
            encrypted_key=self.encrypted_key,
            key_hint=self.key_hint,
            created_at=self.created_at,
        )
