# apps/backend/app/application/agents/

Agent task use cases — the bridge between the API layer and the agent orchestration system.

## Files (to be created in Phase 8)

| File | Use Case | Description |
|---|---|---|
| `run_task.py` | `RunAgentTaskUseCase` | Instantiate the correct agent type, run the ReAct loop, handle guards |
| `approve_step.py` | `ApproveAgentStepUseCase` | Resume or cancel a paused agent task |
| `cancel_task.py` | `CancelAgentTaskUseCase` | Signal a running task to stop cleanly |
| `get_task.py` | `GetAgentTaskUseCase` | Fetch task + paginated steps for the API response |

## Task Lifecycle

```
pending → running → paused (approval gate) → running → completed
                                            → cancelled
                 → failed (guard exceeded, timeout, tool error)
```

`RunAgentTaskUseCase.execute()` is called directly by the HTTP handler (`api/v1/agents.py`'s `create_task`) — it creates the `pending` task row and enqueues the job (`run_agent_task.delay()`, ADR 0004), returning immediately. The actual agent loop (`execute_agent_task()`, `agents/agent_factory.py`) is what runs inside the Celery worker, via `app/tasks/agent_tasks.py`'s `run_agent_task`.
