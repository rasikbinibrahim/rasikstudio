from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.domain.models.agent import AgentTask
from app.domain.models.user import User
from app.domain.models.workspace import Workspace
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.infrastructure.db.repositories.user_repository import UserRepository
from app.infrastructure.db.repositories.workspace_repository import WorkspaceRepository


@pytest.fixture
async def db_sessionmaker(database_url: str, _migrated_schema: None):
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
async def owned_workspace(db_sessionmaker, tmp_path) -> AsyncGenerator[tuple[User, Workspace], None]:
    """A real `users` row + a real `workspaces` row pointing at a real `tmp_path` directory —
    `agent_tasks`/`agent_task_steps`/`agent_audit_log` all have real `NOT NULL` foreign keys, so
    an agent-execution test needs real parent rows, not just in-memory fakes."""
    now = datetime.now(UTC)
    async with db_sessionmaker() as session:
        user = await UserRepository(session).create(
            User(
                id=uuid4(),
                email=f"agent-test-{uuid4()}@example.com",
                name="Agent Test User",
                avatar_url=None,
                auth_provider="local",
                hashed_password=None,
                is_active=True,
                settings={},
                created_at=now,
                updated_at=now,
            )
        )
        workspace = await WorkspaceRepository(session).create(
            Workspace(
                id=uuid4(),
                user_id=user.id,
                name="agent-test-workspace",
                root_path=str(tmp_path),
                settings={},
                last_opened_at=None,
                created_at=now,
                updated_at=now,
            )
        )
        await session.commit()
    yield user, workspace


@pytest.fixture
async def pending_agent_task(db_sessionmaker, owned_workspace) -> AgentTask:
    user, workspace = owned_workspace
    now = datetime.now(UTC)
    async with db_sessionmaker() as session:
        task = await AgentRepository(session).create_task(
            AgentTask(
                id=uuid4(),
                workspace_id=workspace.id,
                session_id=None,
                user_id=user.id,
                description="integration test task",
                status="pending",
                plan=None,
                result=None,
                error=None,
                model="gpt-4o-mini",
                started_at=now,
                finished_at=None,
                created_at=now,
                updated_at=now,
            )
        )
        await session.commit()
    return task
