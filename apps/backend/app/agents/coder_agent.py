from __future__ import annotations

from app.agents.base_agent import BaseAgent


class CoderAgent(BaseAgent):
    """Full read/write/search/git/shell access — the general-purpose agent for "make this code
    change" tasks, per AGENT_FRAMEWORK.md §3."""

    agent_type = "coder"
    default_tool_names = frozenset(
        {
            "read_file",
            "write_file",
            "patch_file",
            "delete_file",
            "list_directory",
            "search_files",
            "grep",
            "search_semantic",
            "get_git_status",
            "git_diff",
            "run_command",
        }
    )
