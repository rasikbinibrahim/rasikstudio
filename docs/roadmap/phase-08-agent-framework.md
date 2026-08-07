# Phase 8 — Agent Framework

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 7, Phase 9
**Estimated effort:** 4 weeks

---

## Objective

Build the complete agent orchestration system: the ReAct loop, all tool implementations, the human approval gate, the agent state machine, and inter-agent communication. By the end of this phase, an orchestrator agent can plan and execute multi-step tasks using tools, emit progress events over WebSocket, and pause for human approval before high-risk actions.

## Architecture

**ReAct loop:**
```
Planner(task, context) → Plan
  ↓ for each step:
Executor(tool_name, args) → ToolResult
  ↓
Reflector(plan, steps_so_far, last_result) → next_action | done | needs_approval
  ↓ loop
```

**Agent types:** `orchestrator`, `coder`, `tester`, `debugger`, `doc_writer`, `researcher`, `reviewer`

**Tool registry (19 tools with risk levels — see `AGENT_FRAMEWORK.md §4` for the full table):**
- Low risk: `read_file`, `list_directory`, `search_files`, `grep`, `get_git_status`, `get_diagnostics`
- Medium risk: `write_file` (new files), `run_command` (safe commands), `browser_navigate`, `browser_screenshot`, `search_semantic`
- High risk: `write_file` (existing), `patch_file`, `delete_file`, `run_command` (destructive), `run_tests`, `browser_click`, `browser_type`, `create_agent` (spawn sub-agent)

**Human approval gate:**
1. Agent reaches a High-risk tool call
2. Emits `agent_approval_required` event over the user's WebSocket channel
3. Task transitions to `paused` state
4. Agent loop suspends (awaits `asyncio.Event`)
5. User approves or denies via `POST /api/v1/agents/{id}/approve`
6. `asyncio.Event` fires, loop resumes or cancels

**Inter-agent protocol:**
```json
{
  "type": "sub_agent_result",
  "task_id": "parent-task-uuid",
  "sub_task_id": "child-task-uuid",
  "agent_type": "coder",
  "status": "completed",
  "summary": "...",
  "artifacts": ["path/to/file.py"]
}
```
Published to `agent:task:{parent_task_id}:results` Redis channel. Parent orchestrator subscribes and awaits all expected sub-agent completions.

**Guards (all enforced by the loop runner):**
- Max iterations: 30 (configurable per task type, not a hard global ceiling)
- Max file writes: 50
- Max shell commands: 20
- Max tokens consumed: 200K
- Timeout: 300s

**Critical requirement:** `read_file` and every other file tool must use `aiofiles` (async), never synchronous `Path.read_text()` — this blocks the event loop under concurrent agent tasks.

**Agent steps persistence:** Each step is inserted into `agent_task_steps` (normalized table from Phase 5), not appended to a JSONB array.

## Dependencies

- Phase 7 complete (WebSocket publisher for agent events)
- Phase 9 (Model Router) — the agent requires `model_router.complete()`
- **Phase 9 must be completed in parallel or before Phase 8 can be fully tested**
- `aiofiles`
- `anyio` or `asyncio` for sub-agent coordination

## Files to Create

**Agents module:**
- `app/agents/base_agent.py` — `BaseAgent`, `AgentContext`, ReAct loop, guard enforcement
- `app/agents/orchestrator_agent.py` — `OrchestratorAgent`, sub-task delegation, inter-agent result collection
- `app/agents/coder_agent.py`
- `app/agents/tester_agent.py`
- `app/agents/debugger_agent.py`
- `app/agents/doc_writer_agent.py`
- `app/agents/researcher_agent.py`
- `app/agents/reviewer_agent.py`
- `app/agents/agent_factory.py` — instantiate agent by type

**Tool registry:**
- `app/agents/tools/registry.py` — `ToolRegistry`, `@tool()` decorator, risk level enum
- `app/agents/tools/file_tools.py` — `read_file`, `write_file`, `patch_file`, `delete_file`, `list_directory`
- `app/agents/tools/search_tools.py` — `search_files`, `grep`, `search_semantic`
- `app/agents/tools/shell_tools.py` — `run_command` (using `create_subprocess_exec`, not `shell=True`)
- `app/agents/tools/git_tools.py` — `get_git_status`, `git_diff`
- `app/agents/tools/browser_tools.py` — `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`
- `app/agents/tools/test_tools.py` — `run_tests`
- `app/agents/tools/agent_tools.py` — `create_agent` (spawn sub-agent)
- `app/agents/tools/lsp_tools.py` — `get_diagnostics`

**Application layer:**
- `app/application/agents/run_task.py` — `RunAgentTaskUseCase`
- `app/application/agents/approve_step.py` — `ApproveAgentStepUseCase`
- `app/application/agents/cancel_task.py` — `CancelAgentTaskUseCase`

**API:**
- `app/api/v1/agents.py` — task CRUD, approve, cancel endpoints

**Audit log:**
- `app/infrastructure/db/models/audit.py` — `AgentAuditLogModel` (INSERT-only)
- `app/infrastructure/db/repositories/audit_repository.py`

## Files to Modify

- `app/api/v1/__init__.py` — include agents router
- `app/api/ws/event_types.py` — add all agent event types
- `app/infrastructure/db/models/agent.py` — confirm `AgentTaskStepModel` from Phase 5 (no `steps JSONB`)

## Acceptance Criteria

- [ ] An agent task can be created via `POST /api/v1/agents/tasks`
- [ ] The agent executes the ReAct loop and emits `agent_step` events over WebSocket for each tool call
- [ ] `read_file` tool uses `aiofiles` (confirmed by code inspection — no `Path.read_text` in any tool)
- [ ] `run_command` uses `create_subprocess_exec` with `shell=False` (confirmed by code inspection)
- [ ] High-risk tool call pauses the task and emits `agent_approval_required` event
- [ ] `POST /api/v1/agents/{id}/approve` resumes the paused task
- [ ] `POST /api/v1/agents/{id}/approve` with `approved: false` fails that one tool call and lets
      the agent plan an alternative, per `AGENT_FRAMEWORK.md` §6 ("Agent may plan an alternative
      approach") — it does not cancel the whole task; a user who wants that uses
      `POST /api/v1/agents/{id}/cancel` instead. This criterion's original wording ("cancels the
      task") was superseded by the more specific design in `AGENT_FRAMEWORK.md` §6.
- [ ] Agent task transitions through: `pending → running → (paused →) completed`
- [ ] Max iterations guard: agent exceeding 30 iterations transitions to `failed` with reason
- [ ] Max timeout guard: task running over 300s transitions to `failed` with a timeout reason (not
      a separate `cancelled` status — `cancelled` is reserved for explicit user cancellation via
      `POST /api/v1/agents/{id}/cancel`, same terminal-failure-status reuse as the iterations guard)
- [ ] Each step is recorded in `agent_task_steps` (not JSONB blob)
- [ ] Each high-risk action is recorded in `agent_audit_log` with before/after hash
- [ ] `GET /api/v1/agents/tasks/{id}/steps` returns paginated step list
- [ ] Orchestrator agent can spawn a sub-agent and receive its result
- [ ] SSRF prevention in `browser_navigate`: `http://169.254.169.254` blocked with error — **not
      testable in this pass**, `browser_navigate` itself isn't built (needs Phase 13's Playwright
      backend; see `AGENT_FRAMEWORK.md` §4's Deferred list). Not silently skipped: re-verify this
      the moment Phase 13 lands a real browser tool.
- [ ] Path traversal prevention in `read_file` and `write_file`: `../../../etc/passwd` rejected

## Testing Strategy

- **Unit tests:** Each tool function (mock filesystem / subprocess), guard enforcement, state machine transitions
- **Integration tests:** Full agent run with real filesystem (temp dir), real subprocess execution, real DB
- **Security tests:** SSRF attempts via browser tool, path traversal via file tools, shell injection via `run_command`
- **Coverage target:** 90% for all tool implementations (from `TESTING_STRATEGY.md`)

## Estimated Effort

**4 weeks**
- Week 1: BaseAgent, ReAct loop, AgentContext, tool registry infrastructure
- Week 2: All 19 tool implementations with tests
- Week 3: Human approval gate, agent state machine, WebSocket event emission, audit log
- Week 4: Orchestrator + sub-agent protocol, API endpoints, integration tests
