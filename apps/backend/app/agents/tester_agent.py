from __future__ import annotations

from app.agents.base_agent import BaseAgent


class TesterAgent(BaseAgent):
    """Writes and runs tests — read/write file access plus `run_tests`, per AGENT_FRAMEWORK.md
    §3. Doesn't get `delete_file`: writing/fixing tests shouldn't need to delete anything."""

    agent_type = "tester"
    default_tool_names = frozenset(
        {
            "ask_followup_question",
            "read_file",
            "write_file",
            "patch_file",
            "list_directory",
            "search_files",
            "grep",
            "run_tests",
            "run_command",
        }
    )
