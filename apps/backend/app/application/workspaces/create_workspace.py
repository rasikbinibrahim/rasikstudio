from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

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
    `last_opened_at`, not create a duplicate every session."""

    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, request: CreateWorkspaceRequest) -> Workspace:
        existing = await self._workspace_repo.get_by_user_and_root_path(
            request.user_id, request.root_path
        )
        if existing is not None:
            await self._workspace_repo.touch_last_opened(existing.id)
            refreshed = await self._workspace_repo.get_by_id(existing.id)
            if refreshed is None:
                raise WorkspaceError("Workspace was deleted concurrently while opening it")
            return refreshed

        now = datetime.now(UTC)
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
