from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.application.workspaces.create_workspace import CreateWorkspaceRequest, CreateWorkspaceUseCase
from app.core.errors import WorkspaceError
from app.domain.models.workspace import Workspace


class FakeWorkspaceRepository:
    """`seed_on_create_conflict`, when set, models the real `uq_workspaces_user_root_path`
    constraint: a concurrent request's row that only becomes visible to *this* request's lookup
    the moment its own `create()` call loses the DB-level race — a fake in-memory store can't
    reproduce a genuine race, so the losing `create()` call raises `IntegrityError` and reveals
    the "winner" row at the same time, exactly as a real transaction's rollback would newly expose
    a concurrently-committed row."""

    def __init__(self, *, seed_on_create_conflict: Workspace | None = None) -> None:
        self.by_id: dict[UUID, Workspace] = {}
        self._seed_on_create_conflict = seed_on_create_conflict
        self.rollback_calls = 0
        self.deleted_before_refresh: UUID | None = None

    async def get_by_id(self, workspace_id: UUID) -> Workspace | None:
        return self.by_id.get(workspace_id)

    async def list_by_user(self, user_id: UUID) -> list[Workspace]:
        return [w for w in self.by_id.values() if w.user_id == user_id]

    async def get_by_user_and_root_path(self, user_id: UUID, root_path: str) -> Workspace | None:
        return next(
            (w for w in self.by_id.values() if w.user_id == user_id and w.root_path == root_path),
            None,
        )

    async def create(self, workspace: Workspace) -> Workspace:
        if self._seed_on_create_conflict is not None:
            winner = self._seed_on_create_conflict
            self._seed_on_create_conflict = None
            self.by_id[winner.id] = winner
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        self.by_id[workspace.id] = workspace
        return workspace

    async def update(self, workspace: Workspace) -> Workspace:
        self.by_id[workspace.id] = workspace
        return workspace

    async def delete(self, workspace_id: UUID) -> None:
        self.by_id.pop(workspace_id, None)

    async def touch_last_opened(self, workspace_id: UUID) -> None:
        if workspace_id == self.deleted_before_refresh:
            del self.by_id[workspace_id]
            return
        existing = self.by_id[workspace_id]
        self.by_id[workspace_id] = Workspace(
            id=existing.id, user_id=existing.user_id, name=existing.name,
            root_path=existing.root_path, settings=existing.settings,
            last_opened_at=datetime.now(UTC), created_at=existing.created_at,
            updated_at=existing.updated_at,
        )

    async def rollback(self) -> None:
        self.rollback_calls += 1


def _request(user_id: UUID) -> CreateWorkspaceRequest:
    return CreateWorkspaceRequest(user_id=user_id, name="My Project", root_path="/home/me/project")


def _workspace(user_id: UUID) -> Workspace:
    now = datetime.now(UTC)
    return Workspace(
        id=uuid4(), user_id=user_id, name="My Project", root_path="/home/me/project",
        settings={}, last_opened_at=now, created_at=now, updated_at=now,
    )


class TestCreateWorkspaceUseCase:
    async def test_creates_a_new_workspace_when_none_exists(self) -> None:
        repo = FakeWorkspaceRepository()
        user_id = uuid4()

        result = await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]

        assert result.user_id == user_id
        assert result.root_path == "/home/me/project"

    async def test_reuses_and_touches_an_already_existing_workspace(self) -> None:
        repo = FakeWorkspaceRepository()
        user_id = uuid4()
        first = await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]

        second = await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]

        assert second.id == first.id
        assert len(repo.by_id) == 1

    async def test_a_lost_race_against_a_concurrent_insert_recovers_via_rollback_and_touch(
        self,
    ) -> None:
        """Real scenario `uq_workspaces_user_root_path` exists to guard: two concurrent requests
        for the same (user_id, root_path) both pass the initial lookup before either inserts, so
        the DB constraint — not the application-layer lookup — is what actually prevents the
        duplicate. The loser must recover by reusing the winner's row, not surface a 500."""
        user_id = uuid4()
        winner = _workspace(user_id)
        repo = FakeWorkspaceRepository(seed_on_create_conflict=winner)

        result = await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]

        assert result.id == winner.id
        assert repo.rollback_calls == 1
        assert len(repo.by_id) == 1

    async def test_reraises_if_the_integrity_error_was_not_actually_a_lost_race(self) -> None:
        """If `create()` fails with `IntegrityError` but no matching row exists afterward, this
        isn't the known race — some other constraint violation occurred, and swallowing it would
        hide a real bug."""
        repo = FakeWorkspaceRepository(seed_on_create_conflict=_workspace(uuid4()))  # different user

        with pytest.raises(IntegrityError):
            await CreateWorkspaceUseCase(repo).execute(_request(uuid4()))  # type: ignore[arg-type]

        assert repo.rollback_calls == 1

    async def test_raises_workspace_error_if_the_reused_row_vanishes_before_the_refresh_read(
        self,
    ) -> None:
        repo = FakeWorkspaceRepository()
        user_id = uuid4()
        existing = await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]
        repo.deleted_before_refresh = existing.id

        with pytest.raises(WorkspaceError):
            await CreateWorkspaceUseCase(repo).execute(_request(user_id))  # type: ignore[arg-type]
