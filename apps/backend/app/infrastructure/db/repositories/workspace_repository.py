from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from app.domain.models.workspace import Workspace
from app.infrastructure.db.models.workspace import WorkspaceModel
from app.infrastructure.db.repositories.base import BaseRepository


class WorkspaceRepository(BaseRepository[WorkspaceModel]):
    model = WorkspaceModel

    async def get_by_id(self, workspace_id: UUID) -> Workspace | None:
        instance = await self.get(workspace_id)
        return instance.to_domain() if instance else None

    async def list_by_user(self, user_id: UUID) -> list[Workspace]:
        result = await self._session.execute(
            select(WorkspaceModel)
            .where(WorkspaceModel.user_id == user_id)
            .order_by(WorkspaceModel.last_opened_at.desc().nulls_last())
        )
        return [row.to_domain() for row in result.scalars()]

    async def get_by_user_and_root_path(self, user_id: UUID, root_path: str) -> Workspace | None:
        """Backs `CreateWorkspaceUseCase`'s find-or-create-on-open behavior — opening the same
        local folder twice should reuse one workspace row (and just bump `last_opened_at`), not
        create a duplicate every time. No DB uniqueness constraint enforces this (only `id` is
        unique); enforced at the application layer instead, same tradeoff already made for the
        rest of this table's soft invariants."""
        result = await self._session.execute(
            select(WorkspaceModel).where(
                WorkspaceModel.user_id == user_id, WorkspaceModel.root_path == root_path
            )
        )
        instance = result.scalar_one_or_none()
        return instance.to_domain() if instance else None

    async def create(self, workspace: Workspace) -> Workspace:
        instance = WorkspaceModel(
            id=workspace.id,
            user_id=workspace.user_id,
            name=workspace.name,
            root_path=workspace.root_path,
            settings=workspace.settings,
            last_opened_at=workspace.last_opened_at,
        )
        await self.add(instance)
        return instance.to_domain()

    async def update(self, workspace: Workspace) -> Workspace:
        instance = await self.get(workspace.id)
        if instance is None:
            raise ValueError(f"Workspace {workspace.id} not found")
        instance.name = workspace.name
        instance.root_path = workspace.root_path
        instance.settings = workspace.settings
        instance.last_opened_at = workspace.last_opened_at
        await self._session.flush()
        # See UserRepository.update()'s comment — same server-computed `updated_at` issue.
        await self._session.refresh(instance)
        return instance.to_domain()

    async def delete(self, workspace_id: UUID) -> None:
        instance = await self.get(workspace_id)
        if instance is not None:
            await self.remove(instance)

    async def touch_last_opened(self, workspace_id: UUID) -> None:
        instance = await self.get(workspace_id)
        if instance is not None:
            instance.last_opened_at = datetime.now(UTC)
            await self._session.flush()
