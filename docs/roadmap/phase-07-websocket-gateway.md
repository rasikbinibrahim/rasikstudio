# Phase 7 — WebSocket Gateway

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 6
**Estimated effort:** 1 week

---

## Objective

Build the real-time event system: a WebSocket gateway that distributes events from the backend (agent progress, file changes, AI stream chunks) to connected desktop clients, using Redis pub/sub as the inter-process bus. By the end of this phase, the desktop app maintains a persistent WebSocket connection and receives typed events.

## Architecture

**Unified streaming:** All real-time events (chat chunks, agent steps, file watch events, git updates) go through a single WebSocket connection per workspace per user (see ADR 0006).

**Event flow (per-user + shared channels — see `BACKEND_ARCHITECTURE.md §6` and `DATABASE_DESIGN.md §6` for the canonical channel reference):**
```
Backend Service → redis.publish("ws:workspace:{id}:user:{uid}", event_json)   # user-scoped
                → redis.publish("ws:workspace:{id}:shared", event_json)       # workspace-wide
                        ↓
Redis Pub/Sub subscriber (per backend instance)
                        ↓
ConnectionManager.send(workspace_id, user_id, event)
                        ↓
WebSocket → Desktop renderer
```

**Connection lifecycle:**
1. Client opens `WS /ws/{workspace_id}`
2. Server sends `{"type": "auth_required"}` challenge
3. Client sends `{"type": "auth", "token": "<jwt>"}` as first message
4. Server validates JWT, registers connection as `(workspace_id, user_id)`
5. Server subscribes the connection to both its user channel and the shared channel
6. Server sends `{"type": "connected", "workspace_id": "...", "user_id": "..."}`
7. Events flow bidirectionally until disconnect

**Event schema (all events):**
```json
{
  "type": "event_type_slug",
  "workspace_id": "uuid",
  "user_id": "uuid",
  "timestamp": "iso8601",
  "data": {}
}
```

**Connection manager:**
- Stores live WebSocket objects keyed by `(workspace_id, user_id)`
- On backend startup, subscribes to `ws:workspace:*` pattern on Redis
- On event received from Redis: looks up connections by `(workspace_id, user_id)` (for user-scoped events) or by `workspace_id` (for shared events), sends to matching connections
- Stale connections detected via ping/pong (30s interval)

**Event types (initial set):**
- `stream_chunk` — AI response token
- `stream_end` — AI stream complete
- `agent_step` — agent executed a tool
- `agent_approval_required` — human gate hit (user-scoped)
- `agent_status_changed` — task state machine transition
- `file_changed` — chokidar event (shared)
- `workspace_indexed` — RAG index complete (shared)
- `git_status_changed` — git working tree changed (shared)

## Dependencies

- Phase 6 complete (JWT validation in first-message auth)
- `websockets` (or FastAPI built-in WebSocket)
- `redis[asyncio]`
- Phase 3 desktop: WebSocket client in `src/services/ws-client.ts`

## Files to Create

**Backend:**
- `app/api/ws/gateway.py` — WebSocket endpoint, first-message auth, connection lifecycle
- `app/api/ws/connection_manager.py` — `ConnectionManager` class, Redis subscriber for both channel types
- `app/api/ws/event_types.py` — Pydantic models for all event types
- `app/api/ws/publisher.py` — `publish_event()` helper used by all backend services (chooses user vs. shared channel)

**Desktop (renderer):**
- `src/services/ws-client.ts` — singleton WebSocket client, reconnect logic, event dispatcher
- `src/hooks/useWebSocket.ts` — React hook for subscribing to typed events
- `src/store/ws-slice.ts` — connection status in Zustand

## Files to Modify

- `app/main.py` — mount WebSocket router
- `app/core/events.py` — start Redis pub/sub subscriber on application startup
- `src/App.tsx` — initialize WebSocket on workspace open

## Acceptance Criteria

- [ ] Desktop app connects to `WS /ws/{workspace_id}` on workspace open
- [ ] First-message auth with valid JWT: connection accepted, `connected` event received
- [ ] First-message auth with invalid JWT: WebSocket closes with code 4401
- [ ] Publishing a user-scoped event to Redis delivers it only to that user's connection(s)
- [ ] Publishing a shared event delivers it to every connected client for the workspace
- [ ] Desktop reconnects automatically after a simulated network drop (within 5 seconds)
- [ ] Connection manager correctly tracks active connections (verify via health endpoint or log)
- [ ] Stale connection cleanup: connection remains after 30s ping/pong, disconnects without response
- [ ] Two concurrent connections for the same `(workspace_id, user_id)` both receive user-scoped events
- [ ] Two different users on the same workspace each receive only their own user-scoped events, but both receive shared events
- [ ] `ws-client.ts` exposes typed `on(eventType, handler)` interface (TypeScript-safe)

## Testing Strategy

- **Unit tests (backend):** ConnectionManager register/unregister, event routing by workspace+user vs. shared
- **Integration tests (backend):** Full WebSocket flow with real Redis (testcontainers)
- **Integration tests (desktop):** WebSocket client reconnect logic (mock WebSocket server)
- **Manual:** Open browser DevTools WebSocket inspector, verify event format

## Estimated Effort

**1 week**
- Day 1–2: ConnectionManager, Redis subscriber (both channels), gateway endpoint
- Day 3: First-message auth, event types, publisher helper
- Day 4: Desktop WebSocket client, reconnect logic, Zustand slice
- Day 5: Tests, polish, verify with real client
