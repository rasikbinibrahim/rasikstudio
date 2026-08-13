from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.core.errors import WorkspaceError
from app.domain.ports.workspace_repository import WorkspaceRepository
from app.tasks.indexing_tasks import index_workspace_task


@dataclass(frozen=True, slots=True)
class IndexWorkspaceRequest:
    workspace_id: UUID
    user_id: UUID


class IndexWorkspaceUseCase:
    """Verifies ownership, then dispatches the real indexing work to a Celery worker (ADR 0004) —
    mirrors `application/agents/run_task.py`'s `RunAgentTaskUseCase` structure: this use case's
    only job is the ownership check and the `.delay()` call, not the indexing itself (that's
    `infrastructure/rag/indexer.py`'s `index_workspace()`, run inside the worker via
    `app/tasks/indexing_tasks.py`). Returns as soon as the job is queued — it does not wait for
    indexing to finish, or even start."""

    def __init__(self, workspace_repo: WorkspaceRepository) -> None:
        self._workspace_repo = workspace_repo

    async def execute(self, request: IndexWorkspaceRequest) -> None:
        workspace = await self._workspace_repo.get_by_id(request.workspace_id)
        if workspace is None or workspace.user_id != request.user_id:
            raise WorkspaceError("Workspace not found")

        index_workspace_task.delay(
            workspace_id=str(workspace.id),
            workspace_root=workspace.root_path,
            user_id=str(request.user_id),
        )
