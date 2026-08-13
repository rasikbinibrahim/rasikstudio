from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from starlette import status

from app.application.workspaces.create_workspace import CreateWorkspaceRequest, CreateWorkspaceUseCase
from app.application.workspaces.delete_workspace import DeleteWorkspaceUseCase
from app.application.workspaces.get_workspace import GetWorkspaceUseCase
from app.application.workspaces.index_workspace import IndexWorkspaceRequest, IndexWorkspaceUseCase
from app.application.workspaces.list_workspaces import ListWorkspacesUseCase
from app.application.workspaces.update_workspace import UpdateWorkspaceRequest, UpdateWorkspaceUseCase
from app.core.dependencies import CurrentUserDep, DbDep
from app.domain.models.workspace import Workspace
from app.infrastructure.db.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

# `/workspaces/{id}/files/*` from API_SPECIFICATION.md §3 is deliberately not implemented here —
# see application/workspaces/README.md for why (would duplicate the desktop app's own local
# Electron IPC file access without a considered design decision behind doing so).


class WorkspaceSchema(BaseModel):
    id: UUID
    name: str
    root_path: str
    settings: dict[str, Any]
    last_opened_at: datetime | None
    created_at: datetime

    @classmethod
    def from_domain(cls, workspace: Workspace) -> WorkspaceSchema:
        return cls(
            id=workspace.id,
            name=workspace.name,
            root_path=workspace.root_path,
            settings=workspace.settings,
            last_opened_at=workspace.last_opened_at,
            created_at=workspace.created_at,
        )


class WorkspaceListSchema(BaseModel):
    items: list[WorkspaceSchema]
    total: int


class CreateWorkspaceRequestSchema(BaseModel):
    name: str
    root_path: str


class UpdateWorkspaceRequestSchema(BaseModel):
    name: str | None = None
    settings: dict[str, Any] | None = None


@router.get("", response_model=WorkspaceListSchema)
async def list_workspaces(user: CurrentUserDep, db: DbDep) -> WorkspaceListSchema:
    workspaces = await ListWorkspacesUseCase(WorkspaceRepository(db)).execute(user.id)
    items = [WorkspaceSchema.from_domain(w) for w in workspaces]
    return WorkspaceListSchema(items=items, total=len(items))


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WorkspaceSchema)
async def create_workspace(
    body: CreateWorkspaceRequestSchema, user: CurrentUserDep, db: DbDep
) -> WorkspaceSchema:
    workspace = await CreateWorkspaceUseCase(WorkspaceRepository(db)).execute(
        CreateWorkspaceRequest(user_id=user.id, name=body.name, root_path=body.root_path)
    )
    return WorkspaceSchema.from_domain(workspace)


@router.get("/{workspace_id}", response_model=WorkspaceSchema)
async def get_workspace(workspace_id: UUID, user: CurrentUserDep, db: DbDep) -> WorkspaceSchema:
    workspace = await GetWorkspaceUseCase(WorkspaceRepository(db)).execute(
        workspace_id=workspace_id, user_id=user.id
    )
    return WorkspaceSchema.from_domain(workspace)


@router.patch("/{workspace_id}", response_model=WorkspaceSchema)
async def update_workspace(
    workspace_id: UUID, body: UpdateWorkspaceRequestSchema, user: CurrentUserDep, db: DbDep
) -> WorkspaceSchema:
    workspace = await UpdateWorkspaceUseCase(WorkspaceRepository(db)).execute(
        UpdateWorkspaceRequest(
            workspace_id=workspace_id, user_id=user.id, name=body.name, settings=body.settings
        )
    )
    return WorkspaceSchema.from_domain(workspace)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(workspace_id: UUID, user: CurrentUserDep, db: DbDep) -> None:
    await DeleteWorkspaceUseCase(WorkspaceRepository(db)).execute(
        workspace_id=workspace_id, user_id=user.id
    )


@router.post("/{workspace_id}/index", status_code=status.HTTP_202_ACCEPTED)
async def index_workspace(workspace_id: UUID, user: CurrentUserDep, db: DbDep) -> None:
    """Queues a real RAG indexing run (ADR 0004, `infrastructure/rag/indexer.py`) and returns
    immediately — progress publishes over the workspace's shared WebSocket channel as
    `index_progress` events (`api/ws/event_types.py`), not in this response."""
    await IndexWorkspaceUseCase(WorkspaceRepository(db)).execute(
        IndexWorkspaceRequest(workspace_id=workspace_id, user_id=user.id)
    )
