from __future__ import annotations

from app.agents.tools.test_tools import _detect_default_command, run_tests


class TestRunTests:
    async def test_uses_an_explicit_command_override(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_tests(context=ctx, command="echo running-tests")
        assert "running-tests" in result
        assert "Tests passed" in result

    async def test_reports_failure_on_nonzero_exit(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_tests(context=ctx, command="false")
        assert "Tests failed" in result

    async def test_no_detectable_command_is_an_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_tests(context=ctx)
        assert result.startswith("Error: Could not detect a test command")


class TestDetectDefaultCommand:
    async def test_detects_pytest_from_pyproject_toml(self, tmp_path) -> None:
        (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n")
        assert await _detect_default_command(str(tmp_path)) == "python -m pytest"

    async def test_detects_npm_from_package_json(self, tmp_path) -> None:
        (tmp_path / "package.json").write_text("{}")
        assert await _detect_default_command(str(tmp_path)) == "npm test"

    async def test_returns_none_when_nothing_detected(self, tmp_path) -> None:
        assert await _detect_default_command(str(tmp_path)) is None
