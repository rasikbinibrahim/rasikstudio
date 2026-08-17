# Agent Framework — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The Agent Framework enables autonomous, multi-step task execution within the user's workspace. An agent receives a natural-language goal, decomposes it into a plan, executes tools iteratively, reflects on outcomes, and produces a final result — while streaming every step to the frontend in real time.

---

## 2. Core Loop (ReAct Pattern)

```
User Goal
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                     Agent Loop                          │
│                                                         │
│  ┌─────────┐     ┌──────────┐     ┌──────────────────┐ │
│  │ Planner │────►│ Executor │────►│    Reflector     │ │
│  │         │     │          │     │                  │ │
│  │ Decom-  │     │ Execute  │     │ Did step succeed?│ │
│  │ pose to │     │ one tool │     │ Is goal met?     │ │
│  │ steps   │     │ at a time│     │ Plan still valid?│ │
│  └─────────┘     └──────────┘     └────────┬─────────┘ │
│       ▲                                    │           │
│       │                ┌───────────────────┘           │
│       │                │ No → re-plan or continue      │
│       └────────────────┘                               │
│                        │ Yes → done                    │
└────────────────────────┼────────────────────────────────┘
                         ▼
                   Final Result
```

Each iteration: **Think → Act → Observe → Reflect**

---

## 3. Agent Types

| Type | Role | Model |
|---|---|---|
| `orchestrator` | Decomposes task, spawns sub-agents, synthesizes | qwen2.5:72b / claude-opus |
| `coder` | Reads/writes code | qwen2.5-coder:32b / claude-sonnet |
| `tester` | Writes and runs tests | qwen2.5-coder:32b |
| `debugger` | Analyzes errors, traces, proposes fixes | deepseek-r1:32b |
| `doc_writer` | Writes documentation | deepseek-r1:7b / claude-haiku |
| `researcher` | Searches codebase and web | any |
| `reviewer` | Reviews code for quality and security | claude-opus |

For simple tasks, a single `coder` agent handles the full loop. For complex tasks, the `orchestrator` spawns specialized sub-agents.

---

## 4. Tool Registry

Tools are registered at startup. Each tool is a callable with a typed schema:

```python
@tool(
    name="read_file",
    description="Read the content of a file in the workspace",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path from workspace root"}
        },
        "required": ["path"]
    }
)
async def read_file(path: str, context: AgentContext) -> str:
    abs_path = resolve_workspace_path(context.workspace_root, path)   # raises outside the workspace
    if not await aiofiles.os.path.isfile(abs_path):
        return f"Error: File not found: {path}"
    async with aiofiles.open(abs_path, encoding="utf-8") as f:
        return await f.read()
```

(This example uses `aiofiles` and `resolve_workspace_path()`, not the synchronous `Path.read_text()`
shown in earlier drafts of this doc — a synchronous read would block the event loop for every other
concurrent agent task and unrelated request, which is exactly what `tools/README.md`'s security
requirements and `phase-08-agent-framework.md`'s acceptance criteria forbid.)

### Available Tools

All 19 originally-scoped tools are now built (13 in Phase 8, 5 more — the browser tools — in
Phase 13, `get_diagnostics` added 2026-08-13), plus `ask_followup_question` (also added
2026-08-13, not part of the original 19-tool scope).
Risk level is a static property of the tool's *name*, not computed per-call from arguments — so,
unlike this doc's original draft, there is no separate "new file" vs. "existing file" risk tier for
`write_file`, nor a "safe" vs. "destructive" tier for `run_command`: each tool name has exactly one
risk level, set where it's registered (`app/agents/tools/registry.py`'s `@tool()` decorator).

| Tool | Description | Risk Level |
|---|---|---|
| `read_file` | Read file content | Low |
| `list_directory` | List directory contents | Low |
| `search_files` | Find files by glob pattern | Low |
| `grep` | Search text in files | Low |
| `search_semantic` | Semantic search via RAG | Low |
| `get_git_status` | Git working tree status | Low |
| `git_diff` | Get file diff | Low |
| `patch_file` | Apply a unified diff patch to an existing file | Medium |
| `write_file` | Write/overwrite a file (creates it if new) | High |
| `delete_file` | Delete a file | High |
| `run_command` | Execute a shell command (`create_subprocess_exec`, never `shell=True`) | High |
| `run_tests` | Run the workspace's test suite | High |
| `create_agent` | Spawn a specialized sub-agent | High |
| `browser_navigate` | Navigate the agent's headless browser to a URL (SSRF-guarded) | Medium |
| `browser_screenshot` | Full-page screenshot as a base64 PNG data URI | Low |
| `browser_get_text` | Extract an element's visible text by CSS selector | Low |
| `browser_click` | Click an element by CSS selector — mutates real page state | High |
| `browser_type` | Type into an input element by CSS selector — mutates real page state | High |
| `ask_followup_question` | Pause and ask the user an open-ended clarifying question | Low |
| `get_diagnostics` | Real language-server diagnostics for a file (Python only, via `pylsp`) | Low |

(Renamed from this doc's original `create_sub_agent`/Medium to match `tools/README.md`'s
`agent_tools.py` file table — the two disagreed on both the name and the risk level; the more
Phase-8-specific doc won, same resolution rule as every other cross-doc conflict this session.
`list_files`/`create_directory`/`move_file`/`git_status`/`git_stage`/`git_commit`/`search_codebase`
from this doc's original tool list were never built as separate tools — `list_directory` and
`get_git_status` cover the first two, and staging/committing/directory-creation weren't judged
necessary for the agent loop to be useful; add them if a real workflow needs them rather than
building them speculatively.)

**Resolved 2026-08-13:** `get_diagnostics` is now real — `app/infrastructure/lsp/client.py`
(a minimal, dependency-free LSP client speaking Content-Length-framed JSON-RPC over a spawned
server's stdio, no third-party LSP client library, mirroring `GitService`/`DockerService`'s own
"own the subprocess, no shell interpolation" convention) plus `app/infrastructure/lsp/manager.py`
(`LspClientManager`, one `pylsp` process per workspace, lazy-started, idle-closed after 15 minutes
— the same shape as `PlaywrightBrowserService`, including a constructor-injectable idle timeout so
the real close-after-idle behavior is test-verified, not left untested the way the WebSocket
gateway's 30s timeout originally was). **Python only, deliberately** — the desktop's own
`lsp-manager.ts` also resolves TypeScript/JSON servers from `apps/desktop/node_modules` (another
app's npm dependencies in this monorepo), which this backend has no clean way to reach; `pylsp` is
resolved the same way the desktop already does (PATH, or `uvx --from python-lsp-server[flake8]
pylsp` as a fallback — real testing found the *bare* `python-lsp-server` package installs zero
diagnostic-producing plugins, since pyflakes/pycodestyle/mccabe are optional PyPI extras, not base
dependencies; `[flake8]` pulls in exactly that trio, verified for real against a broken test file).
Verified against a real, unmocked `pylsp` process in this environment: a real unused-import
warning, a real undefined-name error, and a real pycodestyle spacing warning all came back
correctly for a genuinely broken file, and a clean file correctly reported zero diagnostics.
TypeScript/JSON diagnostics remain a real, separate follow-up (`TASKS.md`) — either vendoring
those servers as a backend dependency, or a new API the desktop's already-running LSP client
answers instead of duplicating it.

The browser tools (`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`/
`browser_get_text`, Phase 13) call `app/infrastructure/browser/playwright_service.py`'s
`PlaywrightBrowserService` — one headless Chromium instance per workspace, lazy-started on first
use, closed after 30 minutes idle. `browser_navigate` runs every URL through
`app/infrastructure/browser/ssrf_guard.py` before any network activity: disallowed schemes
(`file:`/`data:`/`javascript:`/anything but `http`/`https`) and any DNS-resolved address that's
private/loopback/link-local/multicast/reserved/unspecified (both IPv4 and IPv6) are rejected —
this is what blocks an agent from being tricked into reading `file:///etc/passwd` or reaching
cloud metadata endpoints (`169.254.169.254`) via a malicious page's redirect. No separate
screenshot-streaming path exists: every tool's return value already streams to the desktop over
the user's WebSocket channel via the existing `AgentStepEvent` pipeline (`base_agent.py`), so
`browser_screenshot`'s base64 PNG data URI return value gets there for free.

`ask_followup_question` (added 2026-08-13, `app/agents/tools/interaction_tools.py`) is Cline's
`ask_followup_question` equivalent (`docs/reference/cline/TOOL_DESIGN_NOTES.md`, which named this
project's total lack of a mid-task clarifying-question capability as a real gap): previously an
ambiguous task either got a best-effort guess or failed a guard rail, never a question back to the
user. Distinct from §6's approval gate below — that's a binary yes/no decision on one specific
tool call already about to run; this is the agent pausing to ask something open-ended *before* it
decides what to do at all. Mechanically it reuses `agents/running_tasks.py`'s existing one-shot
Redis `BLPOP` hand-off (`wait_for_answer`/`submit_answer`, the same shape as
`wait_for_approval`/`resolve_approval`), publishes a new `agent_question_asked` WebSocket event,
and is answered via `POST /api/v1/agents/tasks/{id}/answer`. `BaseAgent.run()` wraps the call with
a `paused`/`running` DB status transition, mirroring how §6's approval gate wraps a HIGH-risk tool
call — triggered by tool name rather than risk level, since every call to this specific tool needs
it. Cancelling a task while it's blocked waiting on an answer resolves the wait with a synthetic
`AgentQuestionCancelled` (caught inside the tool itself, not left to propagate as an unhandled
exception), the same real problem `request_cancel`'s approval-key push already solved for the
approval gate, solved the same way here instead of a second mechanism.

---

## 5. AgentContext

Every tool execution receives an `AgentContext`:

```python
@dataclass
class AgentContext:
    task_id: UUID
    workspace_id: UUID
    workspace_root: Path
    user_id: UUID
    model: str
    event_emitter: EventEmitter       # publishes events to WebSocket
    require_approval: bool = True     # whether to gate high-risk actions
    approved_actions: set[str] = field(default_factory=set)  # actions pre-approved by user
```

**No `memory: AgentMemory` field in the real implementation.** Long-term-memory retrieval/
extraction needs `memory_classifier.py` (`domain/services/README.md`), which isn't in Phase 8's
own Files-to-Create list — adding a `memory` field here would mean either a fake no-op
`AgentMemory` or scope creep into work that belongs to whichever phase actually builds fact
extraction. See `TASKS.md` for the follow-up; §7.2 below still describes the intended design.

---

## 6. Human Approval Gate

For high-risk tools (`write_file`, `delete_file`, `run_command`, `run_tests`, `create_agent`) when `require_approval=True`:

```
Agent wants to run_command("rm -rf dist/")
    │
    ▼
Emit: agent_approval_required {task_id, action, command, preview}
    │
    ▼
Pause task execution (awaiting event)
    │
    ▼
User approves/denies via UI (POST /agents/tasks/{id}/approve)
    │
    ├── Approved → resume execution, add to approved_actions set
    └── Denied   → agent receives "Action denied by user" result
                   Agent may plan an alternative approach
```

---

## 7. Agent Memory

### 7.1 Short-Term Memory (Context Window)

The agent's context window is its working memory. It contains:
- Task description and plan
- All previous steps and their outputs
- Relevant files (from tool calls)
- Recent observations

Context is managed to stay within the model's token limit.

### 7.2 Long-Term Memory (Vector Store)

After a task completes, key facts are extracted and stored as embeddings:

```python
memory_items = [
    "auth.ts uses bcrypt with work factor 12 for password hashing",
    "the test suite uses pytest-asyncio with anyio backend",
    "the deployment runs on port 8000 behind nginx",
]
```

On future tasks, relevant memories are retrieved via semantic search and injected into the system prompt.

**See:** `MEMORY_SYSTEM.md` for full details.

---

## 8. Multi-Agent Orchestration

For complex tasks, the orchestrator spawns sub-agents:

```python
class OrchestratorAgent(BaseAgent):
    async def run(self, task: str) -> str:
        # 1. Create a plan
        plan = await self.plan(task)
        
        # 2. Spawn sub-agents for each subtask in parallel (where safe)
        results = []
        for subtask in plan.subtasks:
            agent = self._create_agent(subtask.agent_type)
            result = await agent.run(subtask.description)
            results.append(result)
        
        # 3. Synthesize results
        return await self.synthesize(results)
```

Sub-agents communicate via the Redis event bus (publish results to `agent:task:{parent_task_id}:results`).

---

## 9. Event Streaming

Every agent step emits an event over WebSocket, through `AgentContext.event_emitter`
(`app/agents/context.py`'s `EventEmitter` — a thin, typed wrapper around `api/ws/publisher.py`'s
`publish_event()`, one method per event kind rather than one generic `emit(dict)`):

```python
await self._context.event_emitter.step(
    self._context.task_id,
    index=step.index,
    tool_name=step.tool,
    args=step.args,
    result=step.result,
)
```

`EventEmitter` also has `started()`, `approval_required()`, `status_changed()`, `completed()`, and
`failed()` — one call per `app/api/ws/event_types.py` event class (`AgentStepEvent`,
`AgentApprovalRequiredEvent`, etc.), all published on the user-scoped Redis channel (agent progress
is only for the user who launched the task, unlike workspace-wide events like `file_changed`).

The frontend displays a live timeline of steps in the Agent Panel — **not yet built**: Phase 8's
own scope was backend-only (see `docs/roadmap/phase-08-agent-framework.md`'s Files to Create list),
so `apps/desktop/src/features/agent/` still has no components. Tracked in `TASKS.md`.

---

## 10. Agent State Machine

**Implementation note (Phase 8, updated when ADR 0004's Celery infrastructure was actually built):**
tasks originally ran as an `asyncio.create_task()` scheduled directly by the
`POST /api/v1/agents/tasks` handler — Celery infrastructure didn't exist yet at Phase 8, and this
note used to predict the eventual swap would be "a small, contained change." That turned out to be
half right: `RunAgentTaskUseCase.execute()` → `run_agent_task.delay()` (`app/tasks/agent_tasks.py`)
genuinely was small, since `execute_agent_task()` already built its own DB session and Redis
client rather than reusing request-scoped ones. What wasn't small: `RunningTaskRegistry`
(`agents/running_tasks.py`), which tracked cancellation and human-approval hand-offs with plain
in-process `asyncio.Event`/`asyncio.Future` objects — correct only because the task and the
API request handling `cancel`/`approve` used to run in the *same* process. Once the agent task
moved to a separate Celery worker process, that stopped being true, and the registry had to become
Redis-backed (a heartbeat key, a cancel flag, and a `BLPOP`-based approval hand-off — all keyed by
task id) so the API process and the worker process have something to coordinate through. See
`agents/running_tasks.py`'s own docstring for the concrete key design, and ADR 0004's Outcome for
why chat message streaming deliberately did *not* make the same move.

```
pending
    │
    ▼ (task picked up by a Celery worker — see note above)
running
    │
    ├──────────────────────────────────► paused  (approval required)
    │                                       │
    │                              ◄────────┘ (user approves/denies)
    │
    ├──► completed  (goal achieved)
    │
    ├──► failed     (max iterations exceeded, or unrecoverable error)
    │
    └──► cancelled  (user cancels)
```

Max iterations: 30 (configurable per task type). If the agent hasn't reached its goal by iteration 30, it returns its best partial result and marks the task as `failed`.

---

## 11. Iteration Limits and Safety

| Guard | Value | Behavior |
|---|---|---|
| Max iterations | 30 | Stop, return partial result |
| Max file writes per task | 50 | Refuse further writes, ask user |
| Max shell commands per task | 20 | Require approval for each after limit |
| Max tokens consumed | 200K | Summarize context, continue |
| Task timeout | 300s | Cancel task, report timeout |

---

## 12. Agent Prompt Engineering

System prompt structure for agents:

```
You are a {agent_type} agent working inside Rasik Studio IDE.
Your workspace is at: {workspace_root}

## Your Task
{task_description}

## Rules
- Use tools to explore before making changes.
- Read files before writing them.
- Prefer targeted edits (patch_file) over full rewrites (write_file).
- Verify changes compile/pass tests before reporting completion.
- If you are unsure, ask the user rather than guessing.
- Never delete files without explicit confirmation.

## Available Tools
{tool_schemas}

## Workspace Memory
{relevant_memories}

## Previous Steps
{step_history}
```

---

## 13. Failure Recovery

When a tool fails, the agent receives the error as its observation and may:

1. Retry with corrected arguments.
2. Try an alternative tool.
3. Ask the user for clarification (via `emit_question` event).
4. Abandon the subtask and report the blocker.

The agent is not allowed to silently ignore errors.
