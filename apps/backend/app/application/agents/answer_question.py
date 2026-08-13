from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from redis.asyncio import Redis
from starlette import status

from app.agents.running_tasks import running_tasks
from app.core.errors import AgentError
from app.domain.ports.agent_repository import AgentRepository


@dataclass(frozen=True, slots=True)
class AnswerAgentQuestionRequest:
    task_id: UUID
    user_id: UUID
    answer: str


class AnswerAgentQuestionUseCase:
    """Resolves the `ask_followup_question` tool's own hand-off (`agents/running_tasks.py`'s
    `wait_for_answer`/`submit_answer`) — same shape as `ApproveAgentStepUseCase`, just answering
    an open-ended question instead of a binary approval. Unlike a denied approval, there's no
    "reason" field here: the answer itself *is* the tool's whole return value."""

    def __init__(self, agent_repo: AgentRepository, redis: Redis) -> None:
        self._agent_repo = agent_repo
        self._redis = redis

    async def execute(self, request: AnswerAgentQuestionRequest) -> None:
        task = await self._agent_repo.get_task(request.task_id)
        if task is None or task.user_id != request.user_id:
            raise AgentError("Agent task not found", code="agent_task_not_found")
        if task.status != "paused":
            raise AgentError(
                f"Agent task is '{task.status}', not awaiting an answer",
                code="agent_task_not_paused",
                status_code=status.HTTP_409_CONFLICT,
            )

        resolved = await running_tasks.submit_answer(request.task_id, request.answer, self._redis)
        if not resolved:
            raise AgentError(
                "Agent task is not actively running in this process",
                code="agent_task_not_active",
                status_code=status.HTTP_409_CONFLICT,
            )
