from __future__ import annotations

import asyncio
import contextlib
from collections import defaultdict
from uuid import UUID

import structlog
from fastapi import WebSocket
from redis.asyncio import Redis

logger = structlog.get_logger("ws")

ConnectionKey = tuple[UUID, UUID]


class ConnectionManager:
    """In-process registry of live WebSocket connections, keyed by `(workspace_id, user_id)` for
    user-scoped delivery and by `workspace_id` alone for shared/broadcast delivery. One instance
    per backend process — with more than one backend replica, each only knows about its own
    connections, which is exactly why events are routed via Redis pub/sub (`RedisEventSubscriber`
    below) rather than an in-memory-only broadcast: a connection on replica A still receives an
    event a different service published while talking to replica B."""

    def __init__(self) -> None:
        self._by_user: dict[ConnectionKey, set[WebSocket]] = defaultdict(set)
        self._by_workspace: dict[UUID, set[WebSocket]] = defaultdict(set)

    def register(self, workspace_id: UUID, user_id: UUID, websocket: WebSocket) -> None:
        self._by_user[(workspace_id, user_id)].add(websocket)
        self._by_workspace[workspace_id].add(websocket)

    def unregister(self, workspace_id: UUID, user_id: UUID, websocket: WebSocket) -> None:
        self._by_user[(workspace_id, user_id)].discard(websocket)
        if not self._by_user[(workspace_id, user_id)]:
            del self._by_user[(workspace_id, user_id)]
        self._by_workspace[workspace_id].discard(websocket)
        if not self._by_workspace[workspace_id]:
            del self._by_workspace[workspace_id]

    def connection_count(self, workspace_id: UUID | None = None) -> int:
        if workspace_id is None:
            return sum(len(conns) for conns in self._by_workspace.values())
        return len(self._by_workspace.get(workspace_id, ()))

    async def send_to_user(self, workspace_id: UUID, user_id: UUID, message: str) -> None:
        for ws in list(self._by_user.get((workspace_id, user_id), ())):
            await self._safe_send(ws, message)

    async def send_to_workspace(self, workspace_id: UUID, message: str) -> None:
        for ws in list(self._by_workspace.get(workspace_id, ())):
            await self._safe_send(ws, message)

    @staticmethod
    async def _safe_send(ws: WebSocket, message: str) -> None:
        try:
            await ws.send_text(message)
        except Exception:
            # A dead connection here gets cleaned up by the gateway's own receive loop noticing
            # the disconnect (WebSocketDisconnect) and calling unregister() — not this method's
            # job, which is just "deliver to whoever is still actually there."
            logger.warning("ws_send_failed", exc_info=True)


class RedisEventSubscriber:
    """Background task: pattern-subscribes to `ws:workspace:*` on Redis and forwards each message
    to the matching live connection(s) via `ConnectionManager`. One of these runs per backend
    process (started in `core/events.py`'s startup hook) — every replica needs its own subscriber
    to see events regardless of which replica happened to publish them."""

    def __init__(self, redis: Redis, manager: ConnectionManager) -> None:
        self._redis = redis
        self._manager = manager
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        # Owns the Redis client it was constructed with (see core/events.py) — closing it here
        # rather than leaving it to the caller keeps "start a subscriber" / "stop a subscriber"
        # symmetric: whoever calls start() doesn't also need to remember to clean up a connection
        # they didn't explicitly open themselves.
        await self._redis.aclose()
        self._task = None

    async def _run(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe("ws:workspace:*")
        try:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                await self._dispatch(message["channel"], message["data"])
        finally:
            await pubsub.punsubscribe("ws:workspace:*")
            await pubsub.aclose()  # type: ignore[no-untyped-call]  # untyped in redis-py's stubs

    async def _dispatch(self, channel: str, data: str) -> None:
        # "ws:workspace:{workspace_id}:user:{user_id}" or "ws:workspace:{workspace_id}:shared"
        parts = channel.split(":")
        if len(parts) < 4:
            logger.warning("ws_unrecognized_channel", channel=channel)
            return

        try:
            workspace_id = UUID(parts[2])
        except ValueError:
            logger.warning("ws_invalid_workspace_id_in_channel", channel=channel)
            return

        if parts[3] == "shared":
            await self._manager.send_to_workspace(workspace_id, data)
        elif parts[3] == "user" and len(parts) >= 5:
            try:
                user_id = UUID(parts[4])
            except ValueError:
                logger.warning("ws_invalid_user_id_in_channel", channel=channel)
                return
            await self._manager.send_to_user(workspace_id, user_id, data)
        else:
            logger.warning("ws_unrecognized_channel", channel=channel)


# Module-level singleton, matching PtyManager's precedent (apps/desktop/electron/main/pty-manager.ts)
# for the same reason: the gateway endpoint and the Redis subscriber both need to reach the same
# registry, and there is exactly one of these per backend process.
connection_manager = ConnectionManager()
