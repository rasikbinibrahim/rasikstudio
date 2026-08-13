from __future__ import annotations

from app.agents.base_agent import BaseAgent


class DocWriterAgent(BaseAgent):
    """Writes documentation — reads code to document it, writes/patches doc files. No shell/test
    access: writing docs shouldn't need to run anything, per AGENT_FRAMEWORK.md §3."""

    agent_type = "doc_writer"
    default_tool_names = frozenset(
        {
            "ask_followup_question",
            "read_file",
            "write_file",
            "patch_file",
            "list_directory",
            "search_files",
            "grep",
        }
    )
