# apps/backend/tests/unit/agents/

Unit tests for the agent orchestration system.

Key scenarios:
- ReAct loop runs correctly: think → act → observe → reflect
- Guard limits are enforced (iteration count, token budget, timeout)
- State machine transitions: pending → running → paused → completed
- `agent_factory.py` instantiates correct agent class by type string
- Agent context is correctly populated from workspace metadata
