# WebSocket Events

**Endpoint:** `WS /ws/{workspace_id}` — see `AUTHENTICATION.md` for the connect/auth handshake
(ADR 0005: first-message auth, not a query-parameter token) and ADR 0006 for why every event type
listed below shares this one connection rather than a separate stream per kind.

**Source of truth:** `apps/backend/app/api/ws/event_types.py` — every type below is a real,
existing Pydantic model with a discriminated `type` field, not a design sketch. This file mirrors
it, not the other way around; if they disagree, the source file is right and this doc is stale.

## Client → server messages

| `type` | Fields | Purpose |
|---|---|---|
| `auth` | `token` | Must be the first message after connecting — see `AUTHENTICATION.md` §7 |
| `ping` | — | Keepalive |
| `agent_approve` | `task_id`, `approved` | Responds to a pending `agent_approval_required` event |

## Server → client connection-lifecycle messages

| `type` | Fields | Purpose |
|---|---|---|
| `auth_required` | — | Sent immediately on connect, before any `auth` message is processed |
| `connected` | `workspace_id`, `user_id` | Ack once auth succeeds |
| `pong` | — | Reply to `ping` |

Invalid, expired, or missing auth (or a non-`auth` first message) closes the connection with code
`4401` — not a message, a close frame.

## Server → client events (`ServerEvent`, discriminated by `type`)

Every event also carries `workspace_id`, `timestamp`, and `user_id` (`null` for broadcast events
with no single-user origin, like `file_changed`).

| `type` | Fields | Fired by |
|---|---|---|
| `stream_chunk` | `message_id`, `delta` | Chat streaming (Phase 10) — one per token/delta |
| `stream_end` | `message_id`, `finish_reason`, `usage` | Chat streaming, once the reply finishes |
| `agent_started` | `task_id`, `description` | Agent task execution begins |
| `agent_step` | `task_id`, `step_index`, `tool`, `args`, `result` | One per ReAct-loop step (tool call + result) |
| `agent_approval_required` | `task_id`, `action`, `preview` | A high-risk tool call is waiting for a human decision — respond with `agent_approve` |
| `agent_status_changed` | `task_id`, `status` | Task status transition |
| `agent_completed` | `task_id`, `summary` | Task finished successfully |
| `agent_failed` | `task_id`, `error` | Task finished with an error |
| `file_changed` | `path`, `change` (`created`/`modified`/`deleted`) | Workspace file-watcher event |
| `git_status_changed` | `branch` | Git status changed (branch switch, commit, etc.) |
| `index_progress` | `files_done`, `files_total` | RAG workspace-indexing progress — also covers "indexing complete" (`files_done == files_total`), not a separate event; **not currently fired by anything real**, since the indexing pipeline itself was never built (see ADR 0004's Outcome) |

## Routing: per-user vs. shared channels

Redis pub/sub uses two channel shapes (see the Decisions Log): a per-`(workspace_id, user_id)`
channel for events that must reach only the acting user (`agent_approval_required` is the clearest
example — only the user who must approve should see it), and a per-`workspace_id` shared channel
for events every connected user in that workspace should see (`file_changed`,
`git_status_changed`). `publisher.py`'s `publish_event()` picks the right channel based on whether
the event carries a `user_id`.
