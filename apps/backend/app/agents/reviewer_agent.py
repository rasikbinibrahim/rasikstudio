from __future__ import annotations

from app.agents.base_agent import BaseAgent


class ReviewerAgent(BaseAgent):
    """Reviews code for quality and security — read-only plus `git_diff` (the natural "what
    changed" view for a review), per AGENT_FRAMEWORK.md §3. Never gets a write/delete/shell tool:
    a reviewer that could silently "fix" what it's reviewing would defeat the point of review."""

    agent_type = "reviewer"
    default_tool_names = frozenset(
        {
            "ask_followup_question",
            "read_file",
            "list_directory",
            "search_files",
            "grep",
            "get_git_status",
            "git_diff",
        }
    )
