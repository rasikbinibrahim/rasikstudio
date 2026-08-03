# apps/backend/tests/integration/agents/

Integration tests for the full agent execution pipeline with real file system, real subprocess execution, and real database.

Key scenarios:
- Agent reads a real file, writes a new file, steps appear in `agent_task_steps` table
- `run_command` runs a real subprocess (`echo hello`) and captures output
- High-risk tool triggers approval gate, task pauses, approval resumes it
- Max iteration guard: agent exceeding limit transitions to `failed` with reason in DB
- Audit log: every High-risk action is recorded in `agent_audit_log`
- Sub-agent: orchestrator spawns a coder sub-agent, receives its result

All file operations run in a `tmp_path` fixture directory — never in the actual project workspace.
