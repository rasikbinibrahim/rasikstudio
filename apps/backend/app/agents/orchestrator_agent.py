from __future__ import annotations

from app.agents.base_agent import BaseAgent


class OrchestratorAgent(BaseAgent):
    """Decomposes a task and delegates to specialized sub-agents via the `create_agent` tool
    (AGENT_FRAMEWORK.md §8) rather than doing file/shell work itself — its own tool set is
    read-only plus spawning, so its ReAct loop stays "plan → delegate → read the result →
    synthesize" instead of duplicating what a `coder`/`tester`/etc. sub-agent would do."""

    agent_type = "orchestrator"
    default_tool_names = frozenset(
        {"read_file", "list_directory", "search_files", "grep", "get_git_status", "create_agent"}
    )
