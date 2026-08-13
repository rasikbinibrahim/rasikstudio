# OpenHands — Multi-Agent Notes

How parent/child agent communication works in OpenHands, and how this project's own orchestrator
protocol (`AGENT_FRAMEWORK.md` §8) compares.

## OpenHands' delegation model

The controller running one agent can dispatch a **delegate action**, naming a different agent
type and a sub-task description. The delegating agent's loop pauses; a new `AgentController` is
constructed for the delegate agent type, runs its own full ReAct loop to completion (or failure),
and its final result is handed back to the parent as that delegate action's observation — the
parent then continues its own loop with that result in context. Delegation nests (a delegate can
itself delegate further), bounded in practice by the same iteration/cost limits that bound any
single agent's own loop.

## This project's `create_agent` protocol

Structurally the same shape, with a concrete implementation worth naming precisely:

- `create_agent` is a registered tool (`agents/tools/agent_tools.py`, Low risk — it doesn't touch
  the filesystem or shell itself, only starts another agent) available to the `OrchestratorAgent`
  (per `AGENT_FRAMEWORK.md`'s tool table — not every agent type has `create_agent` in its own
  tool set, only the orchestrator's, mirroring how not every OpenHands agent type is expected to
  delegate either).
- Calling it invokes `agent_factory.run_sub_agent(agent_type, task_description, parent_context=
  context)` (`agent_factory.py:147`), which constructs and runs the named sub-agent type
  **synchronously from the orchestrator's own tool-call perspective** — the orchestrator's ReAct
  loop is genuinely blocked (awaiting, not busy-waiting) until the sub-agent finishes, exactly
  like OpenHands' delegate-and-resume model.
- The sub-agent's result string becomes the `create_agent` tool call's observation, which the
  orchestrator then reasons over in its next iteration — same "delegate's output becomes the
  parent's next input" mechanism.
- Separately, the sub-agent's own completion is *also* published to
  `agent:task:{parent_task_id}:results` over Redis pub/sub (`AGENT_FRAMEWORK.md` §8's documented
  schema, verified by `test_agent_factory.py`/the orchestrator integration test in
  `tests/integration/agents/test_agent_execution.py`) — this is additional to the synchronous
  return value, giving any other interested listener (e.g. a future "live sub-agent status" UI
  panel) a way to observe delegation without being the orchestrator itself. OpenHands' own
  frontend similarly gets live per-delegate status over its WebSocket event stream, not just the
  final synchronous result.

## Real difference: persistence

Each sub-agent spawned via `create_agent` gets its own real `AgentTask`/`agent_task_steps` rows
(the same persistence path any top-level task gets — `RunAgentTaskUseCase` and `run_sub_agent()`
both funnel through `agent_factory.create_agent()`, per that function's own docstring at
`agent_factory.py:101`), so a sub-agent's full step history is queryable after the fact via
`GET /api/v1/agents/tasks/{id}/steps` exactly like any other task. Whether OpenHands persists
delegate sub-runs with the same first-class durability (vs. them being ephemeral, visible only
in the parent's own event log) is implementation-detail-dependent on which OpenHands deployment
mode is in use; this project's answer is unconditional — every agent task, delegated or not, is a
real row in `agent_tasks`.

## What this project doesn't have that OpenHands' delegation model does

Cross-delegate cancellation propagation isn't explicitly documented as connected here — cancelling
a parent orchestrator task via `POST /api/v1/agents/{id}/cancel` doesn't currently walk down to
cancel an in-flight sub-agent it spawned via `create_agent` (the sub-agent runs to its own natural
completion or guard-triggered failure). A real, previously-untracked gap this analysis surfaces —
worth a `TASKS.md` follow-up if orchestrator-heavy workflows become common enough for an
un-cancellable in-flight delegate to be a real pain point.
