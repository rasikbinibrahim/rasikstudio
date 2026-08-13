# Cline — Approval Gate Notes

How Cline pauses and resumes execution for human approval, and how this project's own gate
(`AGENT_FRAMEWORK.md` §6, `apps/backend/app/agents/running_tasks.py`'s `ApprovalGate`) compares.

## Cline's mechanism

Cline runs entirely inside one long-lived extension-host process, so "pause and wait for a human"
is just an `await` on a promise that a webview message (the user clicking Approve/Reject in the
sidebar UI) later resolves — no cross-process coordination needed, because there is only one
process. Every tool call that would write to disk or run a shell command shows a preview (a real
diff for file edits, the literal command string for `execute_command`) and blocks until the user
responds, unless the user has enabled "auto-approve" for that action category in settings
(per-category toggles: file edits, commands, browser actions, MCP tools — each independently
auto-approvable).

## This project's mechanism

Structurally harder problem, solved differently: the FastAPI process handling
`POST /api/v1/agents/{id}/approve` is very likely a *different process* than the Celery worker
actually running the agent's ReAct loop (real since the Celery migration, ADR 0004 — task
execution used to be in-process `asyncio.create_task()`, which made this trivial the same way
Cline's single-process model does, but doesn't survive an API-process restart). The gate is
therefore Redis-backed, not an in-process promise:

- `BaseAgent`, on a High-risk tool call, calls `ApprovalGate.wait_for_approval()`, which does a
  blocking `BLPOP` on `agent:approval:{task_id}` (`running_tasks.py:81`) — the worker process
  genuinely blocks (async-blocks, not thread-blocks) until a value appears.
- The API process's `POST .../approve` handler calls `resolve_approval()`, which `RPUSH`es
  `"approved"`/`"denied"` onto that same Redis list (`running_tasks.py:74`) — any process with
  Redis access can push the answer, not just the one that started the task.
- A denial fails only that one tool call (the agent then re-plans) rather than cancelling the
  whole task — `AGENT_FRAMEWORK.md` §6's own documented design, confirmed against Cline's
  "Reject" button, which similarly lets the model try a different approach rather than aborting
  (Cline's UI even offers a text box on rejection so the user can explain *why*, which this
  project's binary approve/deny doesn't — a real, smaller-scope gap worth naming, not present in
  `TASKS.md` before this analysis).

## Real difference worth naming: per-category auto-approve

Cline lets a user pre-approve whole categories of actions (all file edits, all safe commands)
so a trusted, repetitive task doesn't interrupt for every single step. This project's closest
equivalent is `AgentContext.approved_actions` (a set of tool *names*, not categories, checked in
`BaseAgent.run()`'s `needs_approval` computation) — narrower than Cline's category-based toggle,
but the same underlying idea: once a specific tool has been approved once in this task, it stops
re-prompting for that exact tool. Not a gap so much as a smaller-grained version of the same
mechanism; worth revisiting only if per-task action approval turns out to be too granular in
practice.

## What this project does that Cline doesn't

An INSERT-only `agent_audit_log` row (SHA-256 `before_hash`/`after_hash` for file tools) on every
High-risk action, independent of whether it was auto-approved via `approved_actions` or explicitly
approved this time (`AGENT_FRAMEWORK.md` §6, migration `0002_add_agent_audit_log`) — a durable,
queryable record of what actually happened, which a single-user local VS Code extension has less
need for (Cline's own checkpoint/shadow-git mechanism, see `TOOL_DESIGN_NOTES.md`'s sibling
`ANALYSIS.md` §3, is closer to an *undo* mechanism than an audit trail — different problem, no
direct equivalent of `agent_audit_log` in Cline).
