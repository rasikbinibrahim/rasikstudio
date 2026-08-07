from __future__ import annotations

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool


@tool(
    name="create_agent",
    description="Spawn a specialized sub-agent to handle a subtask and wait for its result",
    parameters={
        "type": "object",
        "properties": {
            "agent_type": {
                "type": "string",
                "enum": ["coder", "tester", "debugger", "doc_writer", "researcher", "reviewer"],
                "description": "The type of sub-agent to spawn",
            },
            "task_description": {"type": "string", "description": "What the sub-agent should do"},
        },
        "required": ["agent_type", "task_description"],
    },
    risk=RiskLevel.HIGH,
)
async def create_agent(agent_type: str, task_description: str, context: AgentContext) -> str:
    # Deferred import: `agent_factory.py` builds the full tool pool (including this module, for
    # the orchestrator's own tool set), so importing it at module load time here would be a
    # circular import — this module and `agent_factory.py` genuinely depend on each other, since
    # "spawn a sub-agent" *is* "call the factory." Importing inside the function body resolves it
    # (both modules are fully loaded by the time this actually runs) without restructuring either.
    from app.agents.agent_factory import run_sub_agent

    return await run_sub_agent(agent_type, task_description, parent_context=context)


AGENT_TOOLS = [create_agent]
