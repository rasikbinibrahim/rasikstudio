# ADR 0004: Background Tasks — Celery over arq

## Status

Accepted (2026-08-03) — **implemented for agent task execution 2026-08-11; chat message streaming
deliberately stayed on the in-process alternative — see Outcome below.**

## Context

Two categories of work need to run outside the request/response cycle: long-running agent task
execution (potentially many tool calls, minutes of wall-clock time) and workspace RAG indexing
(embedding an entire codebase). Both need retries, and agent tasks specifically need the ability
to be cancelled mid-run.

## Decision

Use Celery (over `arq`, a lighter-weight asyncio-native task queue) for background work requiring
a broker/worker model.

## Rationale

- **Mature ecosystem** — built-in retry policies, rate limiting, and beat scheduling (for
  periodic work like re-indexing) that `arq` either lacks or requires more manual wiring for.
- **Broad operational familiarity** — Celery's failure modes, monitoring tooling (Flower), and
  deployment patterns are widely documented, lowering the operational risk of the first
  production background-task infrastructure this project stands up.

## Alternatives Considered

- **`arq`** — asyncio-native (no separate worker process model to reason about, shares the same
  event loop primitives as the rest of the FastAPI app), lighter weight, but a smaller ecosystem
  and no built-in beat scheduling.
- **In-process `asyncio.create_task()`, no broker at all** — considered and rejected at
  decision time as insufficiently durable for agent tasks (doesn't survive a backend process
  restart, no cross-process task queue) — see Outcome for how this rejection didn't hold in
  practice.

## Consequences

- Requires standing up a message broker (Redis, already a dependency for caching/pub-sub, so no
  *new* infrastructure component — just a new *use* of the existing one) and at least one Celery
  worker process/deployment target.
- Celery's task-serialization boundary means task arguments must be simple, serializable values —
  a real constraint on how `RunAgentTaskUseCase`-shaped work gets invoked.

## Outcome

**Not implemented through Phase 18** — both categories of work this ADR was written for, agent
task execution (Phase 8) and chat message streaming (Phase 10), ran via in-process
`asyncio.create_task()` for ten phases, the exact alternative this ADR's own "Alternatives
Considered" section rejected at decision time. See the Decisions Log's 2026-08-04 entries for why:
each phase that needed background execution found no Celery infrastructure yet built, and standing
up full Celery infrastructure was consistently judged a larger, separate piece of scope than "make
this one use case run in the background."

**Implemented 2026-08-11, for agent task execution only:**

- `app/core/celery_app.py` — the real `Celery` app, broker and result backend both pointed at
  Redis (already a dependency — a new keyspace, `/1`, not new infrastructure, per this ADR's own
  Consequences). `--pool=threads` rather than the default prefork: prefork forks worker child
  processes *after* `app.infrastructure.db.session`'s module-level async engine has already been
  imported by the parent, and the child inherits the parent's asyncpg connections — a real,
  documented SQLAlchemy-async-engine-plus-`fork()` hazard, not a hypothetical one. Threads avoid
  the fork entirely.
- `app/tasks/agent_tasks.py` — `run_agent_task`, the Celery entrypoint `RunAgentTaskUseCase.execute()`
  now dispatches to via `.delay()`. Each call gets its own event loop via `asyncio.run()` and
  disposes the shared engine at the top of every call — verified for real by
  `tests/integration/agents/test_agent_tasks.py`, which runs the real task function twice in a row
  (via `asyncio.to_thread`, the same execution model `--pool=threads` uses) and confirms the
  second call doesn't inherit a stale, cross-loop connection from the first. Retries are
  deliberately disabled: re-running a partially-completed agent task isn't a safe replay of an
  idempotent job.
- `agents/running_tasks.py`'s `RunningTaskRegistry` — the part of this swap that turned out **not**
  to be small. It used to track cancellation/approval hand-offs with plain in-process
  `asyncio.Event`/`asyncio.Future` objects, correct only because the agent task and the API request
  handling `cancel`/`approve` ran in the same process. Once the task moved to a separate worker
  process, that stopped being true — the registry is now Redis-backed (a heartbeat key with a TTL,
  a cancel flag, and a `BLPOP`-based approval queue, all keyed by task id), so both processes have
  something to actually coordinate through. See that module's own docstring for the key design.
- `docker-compose.yml` gained a `worker` service (same image as `backend`, `celery -A
  app.core.celery_app worker` as its command); `make worker` runs it natively for local dev,
  alongside `make dev`, the same way Postgres/Redis are a separate `infra-up` step.

**Deliberately not moved to Celery: chat message streaming (`application/chat/send_message.py`).**
Revisiting this ADR's own Context section: it names two categories of work — long-running agent
task execution and workspace RAG indexing — neither of which is chat streaming; a later phase's
retrospective Outcome text had folded chat streaming in as a third example, which overstated this
ADR's actual scope. Chat streaming is a live, low-latency token stream tied to one specific WS
connection in the *same* backend deployment that received the request — routing it through a
worker hop would add latency for no durability benefit a user-facing stream actually needs (a
dropped connection just means the stream ends; there's nothing meaningful to "retry" mid-stream).
It still uses `app/core/background.py`'s `fire_and_forget()`, which continues to exist for exactly
this one real, remaining use.

**Implemented 2026-08-11, same day, for the other named category too:** workspace RAG indexing
(`/workspaces/{id}/index`, deferred since Phase 4) — this ADR's other named consumer. Real Celery
task (`app/tasks/indexing_tasks.py`), real chunking (`domain/services/chunker.py`, fixed-size
token chunking with overlap — the AST-aware alternative RAG_SYSTEM.md §3.3 also describes is not
built, a real, tracked follow-up, not a silently dropped requirement), real per-chunk
content-hash-based dedup avoiding wasted embedding calls, real deletion reconciliation for files
removed from disk. See `RAG_SYSTEM.md`'s own implementation-status note for the complete list of
what's real vs. still deferred within the pipeline (no file-watcher-triggered auto-reindex; only
explicit `POST /workspaces/{id}/index` triggers a run).
