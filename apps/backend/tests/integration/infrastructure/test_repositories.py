from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.agent import AgentTask, AgentTaskStep
from app.domain.models.chat import ChatSession, Message
from app.domain.models.user import User
from app.domain.models.workspace import Workspace
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.infrastructure.db.repositories.auth_repository import AuthRepository
from app.infrastructure.db.repositories.chat_repository import ChatRepository
from app.infrastructure.db.repositories.embedding_repository import EmbeddingRepository
from app.infrastructure.db.repositories.memory_repository import MemoryRepository
from app.infrastructure.db.repositories.user_repository import UserRepository
from app.infrastructure.db.repositories.workspace_repository import WorkspaceRepository

NOW = datetime.now(UTC)


def make_user(**overrides: object) -> User:
    defaults: dict[str, object] = dict(
        id=uuid4(),
        email=f"{uuid4()}@example.com",
        name="Test User",
        avatar_url=None,
        auth_provider="local",
        hashed_password="hashed",
        is_active=True,
        settings={},
        created_at=NOW,
        updated_at=NOW,
    )
    defaults.update(overrides)
    return User(**defaults)  # type: ignore[arg-type]


async def make_workspace(session: AsyncSession, **overrides: object) -> Workspace:
    user = await UserRepository(session).create(make_user())
    defaults: dict[str, object] = dict(
        id=uuid4(),
        user_id=user.id,
        name="Test Workspace",
        root_path="/tmp/test-workspace",
        settings={},
        last_opened_at=None,
        created_at=NOW,
        updated_at=NOW,
    )
    defaults.update(overrides)
    return await WorkspaceRepository(session).create(Workspace(**defaults))  # type: ignore[arg-type]


class TestUserRepository:
    async def test_create_and_get_by_id(self, db_session: AsyncSession) -> None:
        repo = UserRepository(db_session)
        created = await repo.create(make_user(email="alice@example.com"))

        fetched = await repo.get_by_id(created.id)

        assert fetched is not None
        assert fetched.email == "alice@example.com"
        assert fetched.name == "Test User"

    async def test_get_by_email(self, db_session: AsyncSession) -> None:
        repo = UserRepository(db_session)
        await repo.create(make_user(email="bob@example.com"))

        fetched = await repo.get_by_email("bob@example.com")

        assert fetched is not None
        assert fetched.email == "bob@example.com"

    async def test_get_by_email_returns_none_when_not_found(self, db_session: AsyncSession) -> None:
        repo = UserRepository(db_session)

        assert await repo.get_by_email("nobody@example.com") is None

    async def test_update_persists_changes(self, db_session: AsyncSession) -> None:
        repo = UserRepository(db_session)
        created = await repo.create(make_user())

        updated = await repo.update(replace(created, name="Renamed"))

        assert updated.name == "Renamed"
        refetched = await repo.get_by_id(created.id)
        assert refetched is not None
        assert refetched.name == "Renamed"


class TestWorkspaceRepository:
    async def test_create_and_list_by_user(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)

        workspaces = await WorkspaceRepository(db_session).list_by_user(workspace.user_id)

        assert [w.id for w in workspaces] == [workspace.id]

    async def test_touch_last_opened_updates_timestamp(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = WorkspaceRepository(db_session)
        assert workspace.last_opened_at is None

        await repo.touch_last_opened(workspace.id)

        refetched = await repo.get_by_id(workspace.id)
        assert refetched is not None
        assert refetched.last_opened_at is not None

    async def test_delete_removes_workspace(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = WorkspaceRepository(db_session)

        await repo.delete(workspace.id)

        assert await repo.get_by_id(workspace.id) is None


class TestChatRepository:
    async def test_append_message_and_get_history_in_order(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = ChatRepository(db_session)
        session = await repo.create_session(
            ChatSession(
                id=uuid4(),
                workspace_id=workspace.id,
                user_id=workspace.user_id,
                title="Test Chat",
                model="deepseek-r1:7b",
                system_prompt=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )

        for i, role in enumerate(["user", "assistant", "user"]):
            await repo.append_message(
                Message(
                    id=uuid4(),
                    session_id=session.id,
                    role=role,  # type: ignore[arg-type]
                    content=f"message {i}",
                    tool_calls=None,
                    tool_call_id=None,
                    token_count=None,
                    finish_reason=None,
                    model=None,
                    created_at=NOW,
                )
            )

        history = await repo.get_history(session.id)

        assert [m.content for m in history] == ["message 0", "message 1", "message 2"]

    async def test_delete_session_cascades_to_messages(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = ChatRepository(db_session)
        session = await repo.create_session(
            ChatSession(
                id=uuid4(),
                workspace_id=workspace.id,
                user_id=workspace.user_id,
                title="Doomed Chat",
                model="deepseek-r1:7b",
                system_prompt=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        await repo.append_message(
            Message(
                id=uuid4(),
                session_id=session.id,
                role="user",
                content="hi",
                tool_calls=None,
                tool_call_id=None,
                token_count=None,
                finish_reason=None,
                model=None,
                created_at=NOW,
            )
        )

        await repo.delete_session(session.id)

        assert await repo.get_session(session.id) is None
        assert await repo.get_history(session.id) == []


class TestAgentRepository:
    async def test_create_task_append_and_list_steps_in_order(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = AgentRepository(db_session)
        task = await repo.create_task(
            AgentTask(
                id=uuid4(),
                workspace_id=workspace.id,
                session_id=None,
                user_id=workspace.user_id,
                description="Refactor the thing",
                status="pending",
                plan=None,
                result=None,
                error=None,
                model=None,
                started_at=None,
                finished_at=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )

        for i in range(3):
            await repo.append_step(
                AgentTaskStep(
                    id=uuid4(),
                    task_id=task.id,
                    index=i,
                    tool="read_file",
                    args={"path": f"file_{i}.py"},
                    result=None,
                    status="pending",
                    started_at=None,
                    finished_at=None,
                )
            )

        steps = await repo.list_steps(task.id)

        assert [s.index for s in steps] == [0, 1, 2]

    async def test_update_status(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = AgentRepository(db_session)
        task = await repo.create_task(
            AgentTask(
                id=uuid4(),
                workspace_id=workspace.id,
                session_id=None,
                user_id=workspace.user_id,
                description="Do a thing",
                status="pending",
                plan=None,
                result=None,
                error=None,
                model=None,
                started_at=None,
                finished_at=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )

        await repo.update_status(task.id, "running")

        refetched = await repo.get_task(task.id)
        assert refetched is not None
        assert refetched.status == "running"


class TestEmbeddingRepository:
    async def test_upsert_then_search_returns_nearest_neighbor_first(
        self, db_session: AsyncSession
    ) -> None:
        workspace = await make_workspace(db_session)
        repo = EmbeddingRepository(db_session)

        close_vector = [1.0] + [0.0] * 767
        far_vector = [0.0] * 767 + [1.0]

        close_id = await repo.upsert(
            workspace_id=workspace.id,
            content="def close(): ...",
            embedding=close_vector,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "hash-a"},
        )
        await repo.upsert(
            workspace_id=workspace.id,
            content="def far(): ...",
            embedding=far_vector,
            metadata={"file_path": "b.py", "chunk_index": 0, "content_hash": "hash-b"},
        )

        results = await repo.search(workspace_id=workspace.id, query_embedding=close_vector, top_k=5)

        assert results[0].id == close_id

    async def test_upsert_same_content_hash_is_a_no_op(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = EmbeddingRepository(db_session)
        vector = [0.5] * 768

        first_id = await repo.upsert(
            workspace_id=workspace.id,
            content="v1",
            embedding=vector,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "same-hash"},
        )
        second_id = await repo.upsert(
            workspace_id=workspace.id,
            content="v1 again",  # different content, but the hash claims it's unchanged
            embedding=vector,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "same-hash"},
        )

        assert first_id == second_id
        results = await repo.search(workspace_id=workspace.id, query_embedding=vector, top_k=1)
        assert results[0].content == "v1"  # not overwritten, since the hash matched

    async def test_upsert_changed_content_hash_updates_in_place(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = EmbeddingRepository(db_session)
        vector = [0.5] * 768

        first_id = await repo.upsert(
            workspace_id=workspace.id,
            content="v1",
            embedding=vector,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "hash-1"},
        )
        second_id = await repo.upsert(
            workspace_id=workspace.id,
            content="v2",
            embedding=vector,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "hash-2"},
        )

        assert first_id == second_id
        results = await repo.search(workspace_id=workspace.id, query_embedding=vector, top_k=1)
        assert results[0].content == "v2"

    async def test_delete_removes_entry(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = EmbeddingRepository(db_session)
        entry_id = await repo.upsert(
            workspace_id=workspace.id,
            content="v1",
            embedding=[0.1] * 768,
            metadata={"file_path": "a.py", "chunk_index": 0, "content_hash": "h"},
        )

        await repo.delete(workspace_id=workspace.id, entry_id=entry_id)

        assert await repo.search(workspace_id=workspace.id, query_embedding=[0.1] * 768) == []


class TestMemoryRepository:
    async def test_search_increments_access_count(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = MemoryRepository(db_session)
        vector = [0.2] * 768
        await repo.upsert(
            workspace_id=workspace.id,
            content="Uses Clean Architecture",
            embedding=vector,
            metadata={"memory_type": "architecture", "source": "agent"},
        )

        first = await repo.search(workspace_id=workspace.id, query_embedding=vector, top_k=1)
        second = await repo.search(workspace_id=workspace.id, query_embedding=vector, top_k=1)

        assert first[0].metadata["access_count"] == 1
        assert second[0].metadata["access_count"] == 2


class TestAuthRepository:
    async def test_store_and_get_by_hash(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = AuthRepository(db_session)
        expires_at = datetime.now(UTC)

        await repo.store(user_id=workspace.user_id, token_hash="abc123", expires_at=expires_at)

        token = await repo.get_by_hash("abc123")
        assert token is not None
        assert token.user_id == workspace.user_id
        assert token.revoked is False

    async def test_revoke_all_for_user(self, db_session: AsyncSession) -> None:
        workspace = await make_workspace(db_session)
        repo = AuthRepository(db_session)
        now = datetime.now(UTC)
        await repo.store(user_id=workspace.user_id, token_hash="t1", expires_at=now)
        await repo.store(user_id=workspace.user_id, token_hash="t2", expires_at=now)

        await repo.revoke_all_for_user(workspace.user_id)

        t1 = await repo.get_by_hash("t1")
        t2 = await repo.get_by_hash("t2")
        assert t1 is not None and t1.revoked is True
        assert t2 is not None and t2.revoked is True
