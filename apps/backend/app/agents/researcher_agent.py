from __future__ import annotations

from app.agents.base_agent import BaseAgent


class ResearcherAgent(BaseAgent):
    """Searches the codebase and the web (AGENT_FRAMEWORK.md §3) — strictly read-only: the browser
    tools included here (`browser_navigate`/`browser_screenshot`/`browser_get_text`) are all
    Low/Medium risk; `browser_click`/`browser_type` (High risk — they mutate state on a real,
    arbitrary website) are deliberately excluded, keeping this agent's whole tool set read-only,
    same as its file/search tools."""

    agent_type = "researcher"
    default_tool_names = frozenset(
        {
            "ask_followup_question",
            "read_file",
            "list_directory",
            "search_files",
            "grep",
            "search_semantic",
            "browser_navigate",
            "browser_screenshot",
            "browser_get_text",
        }
    )
