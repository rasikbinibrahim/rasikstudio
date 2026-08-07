from __future__ import annotations

from app.agents.tools.shell_tools import run_command


class TestRunCommand:
    async def test_captures_stdout_and_exit_code(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="echo hello", context=ctx)
        assert "Exit code: 0" in result
        assert "hello" in result

    async def test_runs_in_the_workspace_root(self, tmp_path, make_context) -> None:
        (tmp_path / "marker.txt").write_text("x")
        ctx = make_context(tmp_path)
        result = await run_command(command="ls", context=ctx)
        assert "marker.txt" in result

    async def test_shell_metacharacters_do_not_enable_injection(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="echo safe; touch injected.txt", context=ctx)
        # The whole string after "echo" is literal argv to `echo`, not shell-interpreted.
        assert "safe; touch injected.txt" in result
        assert not (tmp_path / "injected.txt").exists()

    async def test_unknown_command_is_an_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="this-command-does-not-exist-anywhere", context=ctx)
        assert result.startswith("Error: Command not found")

    async def test_timeout_kills_the_process(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="sleep 5", context=ctx, timeout_seconds=1)
        assert "timed out" in result

    async def test_empty_command_is_an_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="   ", context=ctx)
        assert result == "Error: Empty command"

    async def test_nonzero_exit_code_is_still_a_string_result_not_an_exception(
        self, tmp_path, make_context
    ) -> None:
        ctx = make_context(tmp_path)
        result = await run_command(command="false", context=ctx)
        assert "Exit code: 1" in result
