from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from starlette import status

from app.agents.agent_factory import available_agent_types
from app.application.agents.answer_question import AnswerAgentQuestionRequest, AnswerAgentQuestionUseCase
from app.application.agents.approve_step import ApproveAgentStepRequest, ApproveAgentStepUseCase
from app.application.agents.cancel_task import CancelAgentTaskRequest, CancelAgentTaskUseCase
from app.application.agents.get_task import GetAgentTaskUseCase, ListAgentTasksUseCase
from app.application.agents.run_task import RunAgentTaskRequest, RunAgentTaskUseCase
from app.core.dependencies import CurrentUserDep, DbDep, RedisDep
from app.core.errors import AgentError, ValidationError
from app.domain.models.agent import AgentTask, AgentTaskStep
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.infrastructure.db.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(prefix="/agents", tags=["agents"])

_DEFAULT_STEPS_LIMIT = 100


class AgentTaskSchema(BaseModel):
    id: UUID
    workspace_id: UUID
    description: str
    status: str
    model: str | None
    result: str | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime

    @classmethod
    def from_domain(cls, task: AgentTask) -> AgentTaskSchema:
        return cls(
            id=task.id,
            workspace_id=task.workspace_id,
            description=task.description,
            status=task.status,
            model=task.model,
            result=task.result,
            error=task.error,
            started_at=task.started_at,
            finished_at=task.finished_at,
            created_at=task.created_at,
        )


class AgentTaskListSchema(BaseModel):
    items: list[AgentTaskSchema]
    total: int


class AgentTaskStepSchema(BaseModel):
    id: UUID
    index: int
    tool: str
    args: dict[str, Any]
    result: str | None
    status: str
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def from_domain(cls, step: AgentTaskStep) -> AgentTaskStepSchema:
        return cls(
            id=step.id,
            index=step.index,
            tool=step.tool,
            args=step.args,
            result=step.result,
            status=step.status,
            started_at=step.started_at,
            finished_at=step.finished_at,
        )


class AgentTaskStepListSchema(BaseModel):
    items: list[AgentTaskStepSchema]
    total: int


class CreateAgentTaskRequestSchema(BaseModel):
    workspace_id: UUID
    agent_type: str
    description: str
    model: str
    require_approval: bool = True


class AnswerAgentQuestionRequestSchema(BaseModel):
    answer: str


class ApproveAgentTaskRequestSchema(BaseModel):
    approved: bool
    # Only meaningful on a denial (`approved=False`) — folded into the denied tool call's own
    # observation (`BaseAgent._await_approval()`) so the agent can plan around *why*, not just
    # that it was refused. Cline's equivalent rejection flow supports the same
    # (`docs/reference/cline/APPROVAL_GATE_NOTES.md`).
    reason: str | None = None


async def _get_owned_workspace_root(db: DbDep, workspace_id: UUID, user_id: UUID) -> Path:
    """Same don't-leak-existence pattern `api/v1/workspaces.py` uses — a workspace that exists but
    belongs to someone else 404s, not 403."""
    workspace = await WorkspaceRepository(db).get_by_id(workspace_id)
    if workspace is None or workspace.user_id != user_id:
        raise AgentError("Workspace not found", code="workspace_not_found")
    return Path(workspace.root_path)


@router.post("/tasks", status_code=status.HTTP_201_CREATED, response_model=AgentTaskSchema)
async def create_task(
    body: CreateAgentTaskRequestSchema, user: CurrentUserDep, db: DbDep
) -> AgentTaskSchema:
    if body.agent_type not in available_agent_types():
        raise ValidationError(
            f"Unknown agent type: {body.agent_type}. Valid types: {available_agent_types()}",
            code="unknown_agent_type",
        )
    workspace_root = await _get_owned_workspace_root(db, body.workspace_id, user.id)

    task = await RunAgentTaskUseCase(AgentRepository(db)).execute(
        RunAgentTaskRequest(
            workspace_id=body.workspace_id,
            user_id=user.id,
            agent_type=body.agent_type,
            description=body.description,
            model=body.model,
            workspace_root=workspace_root,
            require_approval=body.require_approval,
        )
    )
    return AgentTaskSchema.from_domain(task)


@router.get("/tasks", response_model=AgentTaskListSchema)
async def list_tasks(workspace_id: UUID, user: CurrentUserDep, db: DbDep) -> AgentTaskListSchema:
    await _get_owned_workspace_root(db, workspace_id, user.id)
    tasks = await ListAgentTasksUseCase(AgentRepository(db)).execute(workspace_id)
    items = [AgentTaskSchema.from_domain(t) for t in tasks]
    return AgentTaskListSchema(items=items, total=len(items))


@router.get("/tasks/{task_id}", response_model=AgentTaskSchema)
async def get_task(task_id: UUID, user: CurrentUserDep, db: DbDep) -> AgentTaskSchema:
    result = await GetAgentTaskUseCase(AgentRepository(db)).execute(task_id, user.id)
    return AgentTaskSchema.from_domain(result.task)


@router.get("/tasks/{task_id}/steps", response_model=AgentTaskStepListSchema)
async def get_task_steps(
    task_id: UUID, user: CurrentUserDep, db: DbDep, offset: int = 0, limit: int = _DEFAULT_STEPS_LIMIT
) -> AgentTaskStepListSchema:
    result = await GetAgentTaskUseCase(AgentRepository(db)).execute(task_id, user.id)
    page = result.steps[offset : offset + limit]
    items = [AgentTaskStepSchema.from_domain(s) for s in page]
    return AgentTaskStepListSchema(items=items, total=len(result.steps))


@router.post("/tasks/{task_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_task(
    task_id: UUID, body: ApproveAgentTaskRequestSchema, user: CurrentUserDep, db: DbDep, redis: RedisDep
) -> None:
    await ApproveAgentStepUseCase(AgentRepository(db), redis).execute(
        ApproveAgentStepRequest(
            task_id=task_id, user_id=user.id, approved=body.approved, reason=body.reason
        )
    )


@router.post("/tasks/{task_id}/answer", status_code=status.HTTP_204_NO_CONTENT)
async def answer_task_question(
    task_id: UUID, body: AnswerAgentQuestionRequestSchema, user: CurrentUserDep, db: DbDep, redis: RedisDep
) -> None:
    await AnswerAgentQuestionUseCase(AgentRepository(db), redis).execute(
        AnswerAgentQuestionRequest(task_id=task_id, user_id=user.id, answer=body.answer)
    )


@router.post("/tasks/{task_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_task(task_id: UUID, user: CurrentUserDep, db: DbDep, redis: RedisDep) -> None:
    await CancelAgentTaskUseCase(AgentRepository(db), redis).execute(
        CancelAgentTaskRequest(task_id=task_id, user_id=user.id)
    )
