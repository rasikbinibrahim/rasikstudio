# apps/backend/app/agents/

Agent orchestration layer. This module sits outside the strict Clean Architecture layers because agent logic is complex enough to warrant its own first-class module — it orchestrates across domain, infrastructure, and application concerns.

## Files (to be created in Phase 8)

| File | Purpose |
|---|---|
| `base_agent.py` | `BaseAgent` abstract class, `AgentContext` dataclass, ReAct loop, guard enforcement |
| `orchestrator_agent.py` | `OrchestratorAgent` — decomposes tasks, spawns sub-agents, collects results |
| `coder_agent.py` | `CoderAgent` — reads and writes code files |
| `tester_agent.py` | `TesterAgent` — writes and runs tests |
| `debugger_agent.py` | `DebuggerAgent` — analyzes errors and traces |
| `doc_writer_agent.py` | `DocWriterAgent` — writes documentation |
| `researcher_agent.py` | `ResearcherAgent` — searches codebase and web |
| `reviewer_agent.py` | `ReviewerAgent` — reviews code for quality and security |
| `agent_factory.py` | Factory function: instantiate the correct agent class by type string |

## ReAct Loop

Each agent runs: **Think → Act → Observe → Reflect** until the goal is met or a guard limit is hit.

## Guards (enforced by BaseAgent)

- Max 30 iterations (configurable per task type)
- Max 50 file writes
- Max 20 shell commands
- Max 200K tokens consumed
- 300s timeout

See `AGENT_FRAMEWORK.md` for the full specification.
