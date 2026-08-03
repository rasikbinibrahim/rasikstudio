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
    abs_path = context.workspace_root / path
    if not abs_path.is_file():
        return f"Error: File not found: {path}"
    return abs_path.read_text(encoding="utf-8")
```

### Available Tools

| Tool | Description | Risk Level |
|---|---|---|
| `read_file` | Read file content | Low |
| `write_file` | Write/overwrite file | Medium |
| `patch_file` | Apply a unified diff patch | Medium |
| `list_files` | List directory contents | Low |
| `create_directory` | Create a directory | Low |
| `delete_file` | Delete a file | High |
| `move_file` | Move/rename a file | Medium |
| `run_command` | Execute shell command | High |
| `grep` | Search text in files | Low |
| `search_codebase` | Semantic search via RAG | Low |
| `git_status` | Git working tree status | Low |
| `git_diff` | Get file diff | Low |
| `git_stage` | Stage files | Low |
| `git_commit` | Commit staged changes | Medium |
| `browser_navigate` | Navigate browser to URL | Medium |
| `browser_screenshot` | Capture browser screenshot | Low |
| `browser_click` | Click browser element | Medium |
| `browser_type` | Type into browser field | Medium |
| `create_sub_agent` | Spawn a specialized sub-agent | Medium |

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
    memory: AgentMemory               # short and long-term memory
    require_approval: bool            # whether to gate high-risk actions
    approved_actions: set[str]        # actions pre-approved by user
```

---

## 6. Human Approval Gate

For high-risk tools (`delete_file`, `run_command`, `git_commit`) when `require_approval=True`:

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

Every agent step emits an event over WebSocket:

```python
async def emit_step(self, step: AgentStep):
    await self.context.event_emitter.emit({
        "type": "agent_step",
        "task_id": str(self.context.task_id),
        "step_index": step.index,
        "tool": step.tool,
        "args": step.args,
        "result": step.result,
        "status": step.status,
        "thinking": step.thinking,     # agent's reasoning (if model supports it)
    })
```

The frontend displays a live timeline of steps in the Agent Panel.

---

## 10. Agent State Machine

```
pending
    │
    ▼ (task picked up by Celery worker)
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
