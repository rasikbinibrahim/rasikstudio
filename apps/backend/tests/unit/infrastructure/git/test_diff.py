from __future__ import annotations

import subprocess

import pytest

from app.infrastructure.git.diff import get_working_tree_diff


@pytest.fixture
def git_repo(tmp_path):
    """Same real-throwaway-repo fixture `tests/unit/agents/tools/test_git_tools.py` already
    established for the agent's own `git_diff` tool — "real behavior beats a mock" applies here
    too, not just to the agent tool this shares no code with (see `diff.py`'s own docstring for
    why they're separate functions despite the similar subprocess call)."""
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True)
    (tmp_path / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=tmp_path, check=True)
    return tmp_path


class TestGetWorkingTreeDiff:
    async def test_returns_the_real_diff_for_a_modified_file(self, git_repo) -> None:
        (git_repo / "a.txt").write_text("hello\nworld\n")

        result = await get_working_tree_diff(git_repo)

        assert "+world" in result
        assert "a.txt" in result

    async def test_returns_an_empty_string_when_there_are_no_changes(self, git_repo) -> None:
        result = await get_working_tree_diff(git_repo)

        assert result == ""

    async def test_returns_an_empty_string_for_a_path_that_is_not_a_git_repository(
        self, tmp_path
    ) -> None:
        result = await get_working_tree_diff(tmp_path)

        assert result == ""

    async def test_scopes_to_a_single_path_when_given_one(self, git_repo) -> None:
        (git_repo / "a.txt").write_text("hello\nworld\n")
        (git_repo / "b.txt").write_text("untracked, ignored by diff\n")

        result = await get_working_tree_diff(git_repo, "a.txt")

        assert "a.txt" in result
        assert "b.txt" not in result
