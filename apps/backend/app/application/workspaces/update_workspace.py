from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any
from uuid import UUID

from app.core.errors import WorkspaceError
from app.domain.models.workspace import Workspace
from app.domain.ports.workspace_repository import WorkspaceRepository


@dataclass(frozen=True, slots=True)
class UpdateWorkspaceRequest:
    workspace_id: UUID
    user_id: UUID
    name: str | None = None
    settings: dict[str, Any] | None = None


class UpdateWorkspaceUseCase:
    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, request: UpdateWorkspaceRequest) -> Workspace:
        workspace = await self._workspace_repo.get_by_id(request.workspace_id)
        if workspace is None or workspace.user_id != request.user_id:
            raise WorkspaceError("Workspace not found")

        updated = replace(
            workspace,
            name=request.name if request.name is not None else workspace.name,
            settings=request.settings if request.settings is not None else workspace.settings,
        )
        return await self._workspace_repo.update(updated)
