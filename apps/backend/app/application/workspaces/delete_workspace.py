from __future__ import annotations

from uuid import UUID

from app.core.errors import WorkspaceError
from app.domain.ports.workspace_repository import WorkspaceRepository


class DeleteWorkspaceUseCase:
    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, *, workspace_id: UUID, user_id: UUID) -> None:
        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None or workspace.user_id != user_id:
            raise WorkspaceError("Workspace not found")
        await self._workspace_repo.delete(workspace_id)
