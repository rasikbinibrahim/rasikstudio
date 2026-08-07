from __future__ import annotations

import pytest

from app.agents.agent_factory import available_agent_types, build_tool_pool, create_agent
from app.agents.coder_agent import CoderAgent
from app.agents.orchestrator_agent import OrchestratorAgent


class TestAvailableAgentTypes:
    def test_lists_all_seven_agent_types(self) -> None:
        assert available_agent_types() == [
            "coder",
            "debugger",
            "doc_writer",
            "orchestrator",
            "researcher",
            "reviewer",
            "tester",
        ]


class TestBuildToolPool:
    def test_includes_every_non_deferred_tool(self) -> None:
        pool = build_tool_pool()
        for name in (
            "read_file",
            "write_file",
            "grep",
            "run_command",
            "get_git_status",
            "run_tests",
            # Phase 13 built the Playwright backend these back onto — no longer deferred.
            "browser_navigate",
            "browser_screenshot",
            "browser_click",
            "browser_type",
            "browser_get_text",
        ):
            assert name in pool
        # Still deferred (no LSP backend) — must never silently appear.
        assert "get_diagnostics" not in pool


class TestCreateAgent:
    def test_instantiates_the_correct_class_by_type(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        pool = build_tool_pool()

        coder = create_agent(
            "coder", model_router=None, tool_pool=pool, agent_repo=None, audit_repo=None, context=ctx
        )
        orchestrator = create_agent(
            "orchestrator", model_router=None, tool_pool=pool, agent_repo=None, audit_repo=None, context=ctx
        )

        assert isinstance(coder, CoderAgent)
        assert isinstance(orchestrator, OrchestratorAgent)

    def test_raises_for_an_unknown_agent_type(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with pytest.raises(ValueError, match="Unknown agent type"):
            create_agent(
                "not-a-real-type",
                model_router=None,
                tool_pool=build_tool_pool(),
                agent_repo=None,
                audit_repo=None,
                context=ctx,
            )

    def test_each_agent_only_gets_its_own_declared_tools(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        pool = build_tool_pool()

        researcher = create_agent(
            "researcher", model_router=None, tool_pool=pool, agent_repo=None, audit_repo=None, context=ctx
        )
        reviewer = create_agent(
            "reviewer", model_router=None, tool_pool=pool, agent_repo=None, audit_repo=None, context=ctx
        )

        researcher_tools = {t.name for t in researcher._tools.as_ai_tools()}
        reviewer_tools = {t.name for t in reviewer._tools.as_ai_tools()}
        assert "write_file" not in researcher_tools
        assert "write_file" not in reviewer_tools
        assert "git_diff" in reviewer_tools
        assert "git_diff" not in researcher_tools
