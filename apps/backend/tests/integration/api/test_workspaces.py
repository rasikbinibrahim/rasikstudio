from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.application.workspaces import index_workspace as index_workspace_module
from app.core.middleware.rate_limiter import limiter

AUTH = "/api/v1/auth"
WORKSPACES = "/api/v1/workspaces"


class _FakeIndexTask:
    """Stands in for the real `index_workspace_task` Celery task object — records `.delay()`
    calls instead of dispatching to a real broker, same "inject at the boundary" approach
    `tests/unit/application/agents/test_run_task.py` uses for `run_agent_task`. A real end-to-end
    dispatch + real indexing run is exercised by `tests/integration/rag/test_indexer.py` instead;
    this only needs to verify the HTTP layer (ownership check, status code, correct dispatch args)."""

    def __init__(self) -> None:
        self.delay_calls: list[dict] = []

    def delay(self, **kwargs) -> None:
        self.delay_calls.append(kwargs)


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    # Same reasoning as test_auth.py — `limiter` is a process-wide singleton and this file
    # registers a fresh user (hitting /auth/register's 5/min limit) in almost every test.
    limiter.reset()


async def _authed_client(test_app: FastAPI, email: str) -> AsyncClient:
    transport = ASGITransport(app=test_app)
    client = AsyncClient(transport=transport, base_url="http://test")
    reg = await client.post(
        f"{AUTH}/register",
        json={"email": email, "name": "Test", "password": "correct-horse-battery-staple"},
    )
    assert reg.status_code == 201
    client.headers["Authorization"] = f"Bearer {reg.json()['access_token']}"
    return client


class TestCreateWorkspace:
    async def test_creates_a_new_workspace(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-create@example.com")

        response = await client.post(WORKSPACES, json={"name": "my-project", "root_path": "/tmp/proj"})

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "my-project"
        assert body["root_path"] == "/tmp/proj"
        assert body["settings"] == {}
        assert body["last_opened_at"] is not None

    async def test_opening_the_same_root_path_twice_reuses_the_same_workspace(
        self, test_app: FastAPI
    ) -> None:
        client = await _authed_client(test_app, "ws-idempotent@example.com")

        first = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/same-path"})
        second = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/same-path"})

        assert first.json()["id"] == second.json()["id"]

        listed = await client.get(WORKSPACES)
        assert listed.json()["total"] == 1  # not two rows for the same folder

    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                WORKSPACES, json={"name": "x", "root_path": "/tmp/x"}
            )

        assert response.status_code == 401


class TestListWorkspaces:
    async def test_only_returns_the_caller_own_workspaces(self, test_app: FastAPI) -> None:
        client_a = await _authed_client(test_app, "ws-list-a@example.com")
        client_b = await _authed_client(test_app, "ws-list-b@example.com")

        await client_a.post(WORKSPACES, json={"name": "a-proj", "root_path": "/tmp/a"})
        await client_b.post(WORKSPACES, json={"name": "b-proj", "root_path": "/tmp/b"})

        response_a = await client_a.get(WORKSPACES)

        names = [w["name"] for w in response_a.json()["items"]]
        assert names == ["a-proj"]


class TestGetWorkspace:
    async def test_returns_a_workspace_the_caller_owns(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-get@example.com")
        created = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/get"})
        workspace_id = created.json()["id"]

        response = await client.get(f"{WORKSPACES}/{workspace_id}")

        assert response.status_code == 200
        assert response.json()["id"] == workspace_id

    async def test_returns_404_for_a_workspace_owned_by_someone_else(self, test_app: FastAPI) -> None:
        owner = await _authed_client(test_app, "ws-owner@example.com")
        other = await _authed_client(test_app, "ws-other@example.com")
        created = await owner.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/owner"})
        workspace_id = created.json()["id"]

        response = await other.get(f"{WORKSPACES}/{workspace_id}")

        assert response.status_code == 404

    async def test_returns_404_for_a_nonexistent_workspace(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-nonexistent@example.com")

        response = await client.get(f"{WORKSPACES}/{uuid4()}")

        assert response.status_code == 404


class TestUpdateWorkspace:
    async def test_renames_a_workspace(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-update@example.com")
        created = await client.post(WORKSPACES, json={"name": "old-name", "root_path": "/tmp/upd"})
        workspace_id = created.json()["id"]

        response = await client.patch(f"{WORKSPACES}/{workspace_id}", json={"name": "new-name"})

        assert response.status_code == 200
        assert response.json()["name"] == "new-name"

    async def test_updates_settings(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-settings@example.com")
        created = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/settings"})
        workspace_id = created.json()["id"]

        response = await client.patch(
            f"{WORKSPACES}/{workspace_id}", json={"settings": {"default_model": "deepseek-r1:7b"}}
        )

        assert response.json()["settings"] == {"default_model": "deepseek-r1:7b"}

    async def test_cannot_update_someone_elses_workspace(self, test_app: FastAPI) -> None:
        owner = await _authed_client(test_app, "ws-update-owner@example.com")
        other = await _authed_client(test_app, "ws-update-other@example.com")
        created = await owner.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/upd-owner"})
        workspace_id = created.json()["id"]

        response = await other.patch(f"{WORKSPACES}/{workspace_id}", json={"name": "hijacked"})

        assert response.status_code == 404


class TestDeleteWorkspace:
    async def test_deletes_a_workspace(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "ws-delete@example.com")
        created = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/del"})
        workspace_id = created.json()["id"]

        delete_response = await client.delete(f"{WORKSPACES}/{workspace_id}")
        assert delete_response.status_code == 204

        get_response = await client.get(f"{WORKSPACES}/{workspace_id}")
        assert get_response.status_code == 404

    async def test_cannot_delete_someone_elses_workspace(self, test_app: FastAPI) -> None:
        owner = await _authed_client(test_app, "ws-delete-owner@example.com")
        other = await _authed_client(test_app, "ws-delete-other@example.com")
        created = await owner.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/del-owner"})
        workspace_id = created.json()["id"]

        response = await other.delete(f"{WORKSPACES}/{workspace_id}")

        assert response.status_code == 404
        still_there = await owner.get(f"{WORKSPACES}/{workspace_id}")
        assert still_there.status_code == 200


class TestIndexWorkspace:
    async def test_queues_a_real_indexing_job_and_returns_202(
        self, test_app: FastAPI, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake_task = _FakeIndexTask()
        monkeypatch.setattr(index_workspace_module, "index_workspace_task", fake_task)
        client = await _authed_client(test_app, "ws-index@example.com")
        created = await client.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/idx"})
        workspace_id = created.json()["id"]

        response = await client.post(f"{WORKSPACES}/{workspace_id}/index")

        assert response.status_code == 202
        assert len(fake_task.delay_calls) == 1
        assert fake_task.delay_calls[0]["workspace_id"] == workspace_id
        assert fake_task.delay_calls[0]["workspace_root"] == "/tmp/idx"

    async def test_cannot_index_someone_elses_workspace(
        self, test_app: FastAPI, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake_task = _FakeIndexTask()
        monkeypatch.setattr(index_workspace_module, "index_workspace_task", fake_task)
        owner = await _authed_client(test_app, "ws-index-owner@example.com")
        other = await _authed_client(test_app, "ws-index-other@example.com")
        created = await owner.post(WORKSPACES, json={"name": "proj", "root_path": "/tmp/idx-owner"})
        workspace_id = created.json()["id"]

        response = await other.post(f"{WORKSPACES}/{workspace_id}/index")

        assert response.status_code == 404
        assert fake_task.delay_calls == []

    async def test_returns_404_for_a_nonexistent_workspace(
        self, test_app: FastAPI, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake_task = _FakeIndexTask()
        monkeypatch.setattr(index_workspace_module, "index_workspace_task", fake_task)
        client = await _authed_client(test_app, "ws-index-missing@example.com")

        response = await client.post(f"{WORKSPACES}/{uuid4()}/index")

        assert response.status_code == 404

    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"{WORKSPACES}/{uuid4()}/index")
        assert response.status_code == 401
