from __future__ import annotations

from uuid import UUID

from app.core.errors import WorkspaceError
from app.domain.models.workspace import Workspace
from app.domain.ports.workspace_repository import WorkspaceRepository


class GetWorkspaceUseCase:
    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, *, workspace_id: UUID, user_id: UUID) -> Workspace:
        workspace = await self._workspace_repo.get_by_id(workspace_id)
        if workspace is None or workspace.user_id != user_id:
            # Same status for "doesn't exist" and "exists but isn't yours" — don't confirm to a
            # caller that some *other* user's workspace UUID is valid, the same don't-leak
            # principle LoginUseCase applies to "wrong password" vs. "no such user".
            raise WorkspaceError("Workspace not found")
        return workspace
