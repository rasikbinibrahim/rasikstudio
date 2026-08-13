# ADR 0006: Streaming Architecture — Unified WebSocket, Not SSE + WebSocket Hybrid

## Status

Accepted (2026-08-03)

## Context

The system streams several kinds of real-time data to the desktop client: AI chat token-by-token
responses, agent task step events (tool calls, results, approval requests), and workspace events
(file changes, git status changes). A common pattern splits these — Server-Sent Events (SSE) for
one-way AI token streams, WebSocket for anything bidirectional (like agent approval responses).

## Decision

Route everything through one WebSocket connection per workspace (`WS /ws/{workspace_id}`),
typed by an `event_type` field in each message — no separate SSE endpoint.

## Rationale

- **One connection, one auth handshake, one reconnect/backoff strategy** in the desktop client
  (`ws-client.ts`) instead of two parallel connection lifecycles to keep in sync.
- **Agent approval is inherently bidirectional** — the server streams `agent_approval_required`,
  the client must respond — which SSE cannot do natively (it would need a separate HTTP POST
  alongside the SSE stream, reintroducing the "two things to keep in sync" problem this decision
  avoids).
- **Redis pub/sub already unifies the server side** — per-user and shared channels (see the
  Decisions Log) publish every event type through the same mechanism regardless of what kind of
  event it is; a single WebSocket gateway subscribing to both is a natural match.

## Alternatives Considered

- **SSE for AI streaming + WebSocket for everything else** — SSE has simpler semantics for
  pure server-to-client streams and better default browser reconnection behavior, but splitting
  chat/agent event delivery across two transports adds real client-side complexity (two
  connection states, two auth flows) for a benefit (SSE's simplicity) that a single well-tested
  WebSocket client absorbs anyway.

## Consequences

- The desktop client needs its own reconnection/backoff logic (SSE's browser-native
  `EventSource` reconnects automatically; a raw WebSocket does not) — `ws-client.ts` implements
  exponential backoff capped at 5 seconds, per the phase's own acceptance criterion.
- Every event type shares one wire format and one gateway's worth of auth/timeout/backpressure
  handling — a bug in the gateway affects all event types at once, not just one stream kind.

## Outcome

Confirmed correct through Phase 16. `stream_chunk`/`stream_end` (chat, Phase 10),
`agent_step`/`agent_approval_required` (agent tasks, Phase 8), and `file_changed`/
`git_status_changed` (workspace events) all flow through the same gateway and the same
`ws-client.ts`/`useWebSocket.ts`/`hooks/useAiEventBridge.ts` client-side pipeline — no second
transport was ever introduced. `hooks/useAiEventBridge.ts` subscribing every event type to its
store handler in one place (rather than duplicated per-panel) is a direct downstream benefit of
this decision holding.
