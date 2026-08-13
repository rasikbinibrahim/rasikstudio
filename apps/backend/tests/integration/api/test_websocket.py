import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
import websockets
from redis.asyncio import Redis

from app.core.middleware.rate_limiter import limiter

AUTH_PATH = "/api/v1/auth"
CLOSE_CODE_UNAUTHORIZED = 4401


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    # Same reasoning as tests/integration/api/test_auth.py — `limiter` is a process-wide singleton.
    limiter.reset()


async def _register_and_get_token(base_url: str, email: str) -> tuple[str, str]:
    async with httpx.AsyncClient(base_url=f"http://{base_url}") as client:
        response = await client.post(
            f"{AUTH_PATH}/register",
            json={"email": email, "name": "Test", "password": "correct-horse-battery-staple"},
        )
        assert response.status_code == 201
        tokens = response.json()
        me = await client.get(
            f"{AUTH_PATH}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
        return tokens["access_token"], me.json()["id"]


class TestConnectionLifecycle:
    async def test_valid_first_message_auth_is_accepted(self, live_server: str) -> None:
        token, user_id = await _register_and_get_token(live_server, "ws-valid@example.com")
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws:
            assert json.loads(await ws.recv()) == {"type": "auth_required"}

            await ws.send(json.dumps({"type": "auth", "token": token}))
            connected = json.loads(await ws.recv())

            assert connected["type"] == "connected"
            assert connected["workspace_id"] == workspace_id
            assert connected["user_id"] == user_id

    async def test_invalid_token_closes_with_4401(self, live_server: str) -> None:
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "token": "not-a-real-token"}))

            with pytest.raises(websockets.exceptions.ConnectionClosed) as exc_info:
                await ws.recv()
            assert exc_info.value.rcvd.code == CLOSE_CODE_UNAUTHORIZED

    async def test_malformed_first_message_closes_with_4401(self, live_server: str) -> None:
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "not_auth", "foo": "bar"}))

            with pytest.raises(websockets.exceptions.ConnectionClosed) as exc_info:
                await ws.recv()
            assert exc_info.value.rcvd.code == CLOSE_CODE_UNAUTHORIZED

    async def test_ping_gets_a_pong(self, live_server: str) -> None:
        token, _ = await _register_and_get_token(live_server, "ws-ping@example.com")
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "token": token}))
            await ws.recv()  # connected

            await ws.send(json.dumps({"type": "ping"}))
            assert json.loads(await ws.recv()) == {"type": "pong"}

    async def test_a_connection_that_sends_nothing_is_closed_after_the_real_idle_timeout(
        self, live_server_short_idle_timeout: str
    ) -> None:
        token, _ = await _register_and_get_token(
            live_server_short_idle_timeout, "ws-idle@example.com"
        )
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server_short_idle_timeout}/ws/{workspace_id}") as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "token": token}))
            await ws.recv()  # connected

            # Sends nothing at all — the real 1-second WS_IDLE_TIMEOUT_SECONDS the fixture set
            # should close the connection server-side, not leave it hanging.
            with pytest.raises(websockets.exceptions.ConnectionClosed) as exc_info:
                await asyncio.wait_for(ws.recv(), timeout=5)
            assert exc_info.value.rcvd.code == 1000  # normal close, not an error close

    async def test_a_ping_resets_the_idle_timer_so_the_connection_stays_open(
        self, live_server_short_idle_timeout: str
    ) -> None:
        token, _ = await _register_and_get_token(
            live_server_short_idle_timeout, "ws-idle-reset@example.com"
        )
        workspace_id = str(uuid4())

        async with websockets.connect(f"ws://{live_server_short_idle_timeout}/ws/{workspace_id}") as ws:
            await ws.recv()  # auth_required
            await ws.send(json.dumps({"type": "auth", "token": token}))
            await ws.recv()  # connected

            # Two round trips spanning more real time than the 1-second idle timeout, each one
            # inside the window — proves the timer is reset per-message, not a fixed connection
            # lifetime.
            for _ in range(2):
                await asyncio.sleep(0.6)
                await ws.send(json.dumps({"type": "ping"}))
                assert json.loads(await ws.recv()) == {"type": "pong"}


class TestEventRouting:
    async def test_user_scoped_event_reaches_only_that_user(
        self, live_server: str, redis_url: str
    ) -> None:
        token_a, user_a = await _register_and_get_token(live_server, "ws-route-a@example.com")
        token_b, _user_b = await _register_and_get_token(live_server, "ws-route-b@example.com")
        workspace_id = str(uuid4())

        async with (
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_a,
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_b,
        ):
            for ws, token in [(ws_a, token_a), (ws_b, token_b)]:
                await ws.recv()
                await ws.send(json.dumps({"type": "auth", "token": token}))
                await ws.recv()

            redis = Redis.from_url(redis_url, decode_responses=True)
            event = {
                "type": "agent_approval_required",
                "workspace_id": workspace_id,
                "user_id": user_a,
                "timestamp": datetime.now(UTC).isoformat(),
                "task_id": str(uuid4()),
                "action": "run_command",
                "preview": None,
            }
            await redis.publish(f"ws:workspace:{workspace_id}:user:{user_a}", json.dumps(event))

            # Immediately follow with a *shared* event both should get. The Redis subscriber
            # dispatches messages from its single `psubscribe` loop strictly in publish order (one
            # `await self._dispatch(...)` at a time — see connection_manager.py), so this shared
            # event is guaranteed to reach both connections only after the user-scoped dispatch
            # above has fully completed. That makes "what does B receive first?" a reliable proxy
            # for "did B receive the user-scoped event" — no arbitrary timeout/flakiness needed to
            # prove a negative.
            marker_event = {
                "type": "file_changed",
                "workspace_id": workspace_id,
                "user_id": None,
                "timestamp": datetime.now(UTC).isoformat(),
                "path": "marker.txt",
                "change": "modified",
            }
            await redis.publish(f"ws:workspace:{workspace_id}:shared", json.dumps(marker_event))
            await redis.aclose()

            received_a = json.loads(await ws_a.recv())
            assert received_a["type"] == "agent_approval_required"

            # If routing were broken and B had also received the user-scoped event, this would be
            # the first thing in B's queue instead of the shared marker event.
            received_b = json.loads(await ws_b.recv())
            assert received_b["type"] == "file_changed"

    async def test_shared_event_reaches_every_connection_in_the_workspace(
        self, live_server: str, redis_url: str
    ) -> None:
        token_a, _ = await _register_and_get_token(live_server, "ws-shared-a@example.com")
        token_b, _ = await _register_and_get_token(live_server, "ws-shared-b@example.com")
        workspace_id = str(uuid4())

        async with (
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_a,
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_b,
        ):
            for ws, token in [(ws_a, token_a), (ws_b, token_b)]:
                await ws.recv()
                await ws.send(json.dumps({"type": "auth", "token": token}))
                await ws.recv()

            redis = Redis.from_url(redis_url, decode_responses=True)
            event = {
                "type": "file_changed",
                "workspace_id": workspace_id,
                "user_id": None,
                "timestamp": datetime.now(UTC).isoformat(),
                "path": "src/main.py",
                "change": "modified",
            }
            await redis.publish(f"ws:workspace:{workspace_id}:shared", json.dumps(event))
            await redis.aclose()

            assert json.loads(await ws_a.recv())["type"] == "file_changed"
            assert json.loads(await ws_b.recv())["type"] == "file_changed"

    async def test_two_connections_for_the_same_user_both_receive_user_scoped_events(
        self, live_server: str, redis_url: str
    ) -> None:
        token, user_id = await _register_and_get_token(live_server, "ws-multi-conn@example.com")
        workspace_id = str(uuid4())

        async with (
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_1,
            websockets.connect(f"ws://{live_server}/ws/{workspace_id}") as ws_2,
        ):
            for ws in (ws_1, ws_2):
                await ws.recv()
                await ws.send(json.dumps({"type": "auth", "token": token}))
                await ws.recv()

            redis = Redis.from_url(redis_url, decode_responses=True)
            event = {
                "type": "agent_approval_required",
                "workspace_id": workspace_id,
                "user_id": user_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "task_id": str(uuid4()),
                "action": "run_command",
                "preview": None,
            }
            await redis.publish(f"ws:workspace:{workspace_id}:user:{user_id}", json.dumps(event))
            await redis.aclose()

            assert json.loads(await ws_1.recv())["type"] == "agent_approval_required"
            assert json.loads(await ws_2.recv())["type"] == "agent_approval_required"
