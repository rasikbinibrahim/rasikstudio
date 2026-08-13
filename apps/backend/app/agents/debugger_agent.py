from __future__ import annotations

from app.agents.base_agent import BaseAgent


class DebuggerAgent(BaseAgent):
    """Analyzes errors and traces, proposes fixes — needs to read code, search, reproduce via
    shell/tests, and patch, per AGENT_FRAMEWORK.md §3."""

    agent_type = "debugger"
    default_tool_names = frozenset(
        {
            "ask_followup_question",
            "read_file",
            "patch_file",
            "list_directory",
            "search_files",
            "grep",
            "search_semantic",
            "get_git_status",
            "git_diff",
            "run_command",
            "run_tests",
        }
    )
