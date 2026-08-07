from __future__ import annotations

from redis.asyncio import Redis

from app.api.ws.event_types import ServerEvent


async def publish_event(redis: Redis, event: ServerEvent, *, shared: bool = False) -> None:
    """Used by backend services (agent execution, chat streaming, RAG indexing, git watching) to
    fan an event out to connected WebSocket clients via Redis — never by writing to a
    `ConnectionManager` directly, since the publishing service and the connection it needs to
    reach may be on different backend replicas (BACKEND_ARCHITECTURE.md §6).

    `shared=True` publishes to every client connected to the workspace (file changes, git status,
    index progress); the default publishes to just `event.user_id`'s connection(s) (stream chunks,
    agent progress, approval prompts) — `event.user_id` is required in that case.
    """
    if shared:
        channel = f"ws:workspace:{event.workspace_id}:shared"
    else:
        if event.user_id is None:
            raise ValueError("event.user_id is required for a non-shared (user-scoped) event")
        channel = f"ws:workspace:{event.workspace_id}:user:{event.user_id}"

    await redis.publish(channel, event.model_dump_json())
