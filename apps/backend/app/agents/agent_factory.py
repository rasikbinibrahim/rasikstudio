from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.agents.base_agent import AgentRunResult, BaseAgent
from app.agents.coder_agent import CoderAgent
from app.agents.context import AgentContext, EventEmitter
from app.agents.debugger_agent import DebuggerAgent
from app.agents.doc_writer_agent import DocWriterAgent
from app.agents.orchestrator_agent import OrchestratorAgent
from app.agents.researcher_agent import ResearcherAgent
from app.agents.reviewer_agent import ReviewerAgent
from app.agents.running_tasks import running_tasks
from app.agents.tester_agent import TesterAgent
from app.agents.tools.agent_tools import AGENT_TOOLS
from app.agents.tools.browser_tools import BROWSER_TOOLS
from app.agents.tools.file_tools import FILE_TOOLS
from app.agents.tools.git_tools import GIT_TOOLS
from app.agents.tools.registry import RegisteredTool, ToolRegistry
from app.agents.tools.search_tools import SEARCH_TOOLS
from app.agents.tools.shell_tools import SHELL_TOOLS
from app.agents.tools.test_tools import TEST_TOOLS
from app.core.config import get_settings
from app.domain.models.agent import AgentTask
from app.domain.ports.audit_repository import AuditRepository
from app.infrastructure.ai.model_router import ModelRouter, load_fallback_chains
from app.infrastructure.ai.providers import ai_providers
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.infrastructure.db.repositories.audit_repository import AuditRepository as ConcreteAuditRepository
from app.infrastructure.db.session import AsyncSessionLocal

_AGENT_CLASSES: dict[str, type[BaseAgent]] = {
    cls.agent_type: cls
    for cls in (
        OrchestratorAgent,
        CoderAgent,
        TesterAgent,
        DebuggerAgent,
        DocWriterAgent,
        ResearcherAgent,
        ReviewerAgent,
    )
}


def available_agent_types() -> list[str]:
    return sorted(_AGENT_CLASSES)


def build_tool_pool() -> dict[str, RegisteredTool]:
    """Every real (non-deferred — see `AGENT_FRAMEWORK.md`'s tool table note) tool, keyed by name.
    Each agent subclass's `default_tool_names` picks its own subset out of this shared pool."""
    all_tools = [
        *FILE_TOOLS,
        *SEARCH_TOOLS,
        *SHELL_TOOLS,
        *GIT_TOOLS,
        *TEST_TOOLS,
        *AGENT_TOOLS,
        *BROWSER_TOOLS,
    ]
    return {t.name: t for t in all_tools}


def create_agent(
    agent_type: str,
    *,
    model_router: ModelRouter,
    tool_pool: dict[str, RegisteredTool],
    agent_repo: AgentRepository,
    audit_repo: AuditRepository,
    context: AgentContext,
) -> BaseAgent:
    cls = _AGENT_CLASSES.get(agent_type)
    if cls is None:
        raise ValueError(f"Unknown agent type: {agent_type}. Valid types: {available_agent_types()}")
    tools = ToolRegistry([tool_pool[name] for name in cls.default_tool_names if name in tool_pool])
    return cls(
        model_router=model_router, tools=tools, agent_repo=agent_repo, audit_repo=audit_repo, context=context
    )


async def execute_agent_task(
    *,
    agent_type: str,
    task_id: UUID,
    workspace_id: UUID,
    workspace_root: Path,
    user_id: UUID,
    model: str,
    description: str,
    require_approval: bool,
) -> AgentRunResult:
    """The one place that actually assembles a `ModelRouter` + tool pool + repositories + Redis
    client and runs an agent to completion. `application/agents/run_task.py`'s
    `RunAgentTaskUseCase` (a top-level task, launched from the API) and `run_sub_agent()` below (a
    sub-task, launched from the `create_agent` tool) both funnel through this rather than each
    re-assembling the same wiring — the only real difference between them is who creates the
    `AgentTask` row first."""
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        async with AsyncSessionLocal() as session:
            agent_repo = AgentRepository(session)
            audit_repo = ConcreteAuditRepository(session)
            context = AgentContext(
                task_id=task_id,
                workspace_id=workspace_id,
                workspace_root=workspace_root,
                user_id=user_id,
                model=model,
                event_emitter=EventEmitter(redis, workspace_id=workspace_id, user_id=user_id),
                require_approval=require_approval,
            )
            model_router = ModelRouter(
                ai_providers,
                load_fallback_chains(settings.fallback_chains_path),
                redis,
                settings.ai_response_cache_ttl_seconds,
            )
            agent = create_agent(
                agent_type,
                model_router=model_router,
                tool_pool=build_tool_pool(),
                agent_repo=agent_repo,
                audit_repo=audit_repo,
                context=context,
            )

            handle = running_tasks.start(task_id)
            try:
                result = await agent.run(description, handle)
            finally:
                running_tasks.finish(task_id)
                await session.commit()
            return result
    finally:
        await redis.aclose()


async def run_sub_agent(agent_type: str, task_description: str, *, parent_context: AgentContext) -> str:
    """Backs the `create_agent` tool (`agents/tools/agent_tools.py`) — runs a sub-agent to
    completion and returns its result as the calling (orchestrator) agent's tool observation, per
    AGENT_FRAMEWORK.md §8's `result = await agent.run(subtask.description)` (a direct await, not a
    fire-and-forget spawn — the orchestrator's loop is what's waiting on this tool call). Also
    publishes the same result to `agent:task:{parent_task_id}:results` on Redis, matching §8's
    inter-agent protocol, for anything else that wants to observe sub-agent completions."""
    sub_task_id = uuid4()
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as session:
        await AgentRepository(session).create_task(
            AgentTask(
                id=sub_task_id,
                workspace_id=parent_context.workspace_id,
                session_id=None,
                user_id=parent_context.user_id,
                description=task_description,
                status="pending",
                plan=None,
                result=None,
                error=None,
                model=parent_context.model,
                started_at=now,
                finished_at=None,
                created_at=now,
                updated_at=now,
            )
        )
        await session.commit()

    result = await execute_agent_task(
        agent_type=agent_type,
        task_id=sub_task_id,
        workspace_id=parent_context.workspace_id,
        workspace_root=parent_context.workspace_root,
        user_id=parent_context.user_id,
        model=parent_context.model,
        description=task_description,
        require_approval=parent_context.require_approval,
    )

    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        payload: dict[str, object] = {
            "type": "sub_agent_result",
            "task_id": str(parent_context.task_id),
            "sub_task_id": str(sub_task_id),
            "agent_type": agent_type,
            "status": result.status,
            "summary": result.summary,
            "artifacts": [],
        }
        await redis.publish(f"agent:task:{parent_context.task_id}:results", json.dumps(payload))
    finally:
        await redis.aclose()

    if result.status == "completed":
        return result.summary or "(sub-agent completed with no summary)"
    return f"Sub-agent '{agent_type}' did not complete: {result.error or result.status}"
