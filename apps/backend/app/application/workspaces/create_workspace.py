from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError

from app.core.errors import WorkspaceError
from app.domain.models.workspace import Workspace
from app.domain.ports.workspace_repository import WorkspaceRepository


@dataclass(frozen=True, slots=True)
class CreateWorkspaceRequest:
    user_id: UUID
    name: str
    root_path: str


class CreateWorkspaceUseCase:
    """`POST /workspaces` (API_SPECIFICATION.md §2) is really "open or create": opening a folder
    the desktop app has already opened before should reuse that workspace row and just bump
    `last_opened_at`, not create a duplicate every session.

    The lookup-then-insert below is racy on its own — two concurrent requests for the same
    (user_id, root_path) can both pass the lookup before either inserts — so it's backed by a real
    `uq_workspaces_user_root_path` DB constraint, and the race's losing request recovers by
    treating the winner's now-existing row the same way a normal cache-hit would (touch + return
    it) rather than surfacing an opaque 500."""

    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, request: CreateWorkspaceRequest) -> Workspace:
        existing = await self._workspace_repo.get_by_user_and_root_path(
            request.user_id, request.root_path
        )
        if existing is not None:
            return await self._touch(existing.id)

        now = datetime.now(UTC)
        try:
            return await self._workspace_repo.create(
                Workspace(
                    id=uuid4(),
                    user_id=request.user_id,
                    name=request.name,
                    root_path=request.root_path,
                    settings={},
                    last_opened_at=now,
                    created_at=now,
                    updated_at=now,
                )
            )
        except IntegrityError:
            await self._workspace_repo.rollback()
            raced = await self._workspace_repo.get_by_user_and_root_path(
                request.user_id, request.root_path
            )
            if raced is None:
                raise
            return await self._touch(raced.id)

    async def _touch(self, workspace_id: UUID) -> Workspace:
        await self._workspace_repo.touch_last_opened(workspace_id)
        refreshed = await self._workspace_repo.get_by_id(workspace_id)
        if refreshed is None:
            raise WorkspaceError("Workspace was deleted concurrently while opening it")
        return refreshed
