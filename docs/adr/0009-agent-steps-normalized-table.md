# ADR 0009: Agent Task Steps — Normalized Table, Not a JSONB Array

## Status

Accepted (2026-08-03)

## Context

An agent task consists of an ordered sequence of steps (tool calls, results, approval gates).
`agent_tasks` needs to record this sequence somewhere — either a `steps JSONB` column on the
`agent_tasks` row itself, or a separate `agent_task_steps` table with a foreign key back to
`agent_tasks`.

## Decision

A separate, normalized `agent_task_steps` table — no `steps JSONB` column on `agent_tasks`.

## Rationale

- **Steps are queried and streamed individually**, not just read as a whole blob — the WebSocket
  gateway publishes one `agent_step` event per step as it happens; a normalized row per step
  matches that access pattern directly, rather than needing to diff/re-serialize a growing JSONB
  array on every append.
- **Real relational constraints and indexes** (a step belongs to exactly one task, ordered by a
  real column) are available on a normalized table and are not meaningfully expressible on a
  JSONB array without application-level enforcement.
- **Appending a step is a single-row `INSERT`**, not a read-modify-write of the entire `steps`
  array under concurrent access — relevant since agent execution can run many steps in sequence
  over a task's lifetime.

## Alternatives Considered

- **`steps JSONB` on `agent_tasks`** — simpler schema (one fewer table/join), and was the
  originally sketched design before this ADR — but the read-modify-write-under-concurrency and
  no-per-step-indexing downsides above were judged worse than one extra join.

## Consequences

- Every step read needs a join (or a separate query) against `agent_task_steps`, rather than
  being inline on the `agent_tasks` row.
- An `agent_audit_log` table (approval-gate decisions) was added in the same normalized spirit
  once Phase 8 needed it — not originally in this ADR's scope, but a direct consequence of having
  already committed to "steps are first-class rows, not an embedded blob."

## Outcome

Confirmed correct and fully implemented since Phase 5 (schema) / Phase 8 (real usage).
`agent_task_steps` has been a real, tested table throughout — `DATABASE_DESIGN.md` and
`MEMORY_SYSTEM.md` both had real drift from this decision at various points (the former briefly
missing the table from its schema listing, contradicting this very ADR) and were corrected to
match the actual implementation, not the other way around. `agent_audit_log` (migration `0002`)
followed the same normalized-table pattern once Phase 8's human-approval-gate feature needed
durable audit records.
