# apps/backend/app/api/ws/

WebSocket gateway — the real-time event channel between the backend and connected desktop clients.

## Files (to be created in Phase 7)

| File | Purpose |
|---|---|
| `gateway.py` | WebSocket endpoint `/ws/{workspace_id}` — connection lifecycle, first-message auth |
| `connection_manager.py` | `ConnectionManager` — tracks live connections, routes events by `(workspace_id, user_id)` |
| `event_types.py` | Pydantic models for all WebSocket event types (discriminated union) |
| `publisher.py` | `publish_event()` — used by backend services to publish events to Redis for delivery |

## Authentication Protocol

Connection uses first-message authentication (not query-parameter JWT — see ADR 0005):

1. Client connects to `WS /ws/{workspace_id}`
2. Server sends `{"type": "auth_required"}`
3. Client sends `{"type": "auth", "token": "<jwt>"}`
4. Server validates JWT, registers `(workspace_id, user_id)` → WebSocket connection
5. Server sends `{"type": "connected", ...}`

## Event Routing

All events are user-scoped: Redis pub/sub key = `ws:workspace:{id}:user:{uid}`. Events meant for all users in a workspace use key `ws:workspace:{id}:shared`.
