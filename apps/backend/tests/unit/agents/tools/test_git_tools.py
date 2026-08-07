from __future__ import annotations

import subprocess

import pytest

from app.agents.tools.git_tools import get_git_status, git_diff


@pytest.fixture
def git_repo(tmp_path):
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True)
    (tmp_path / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=tmp_path, check=True)
    return tmp_path


class TestGetGitStatus:
    async def test_clean_tree(self, git_repo, make_context) -> None:
        ctx = make_context(git_repo)
        result = await get_git_status(context=ctx)
        assert "M a.txt" not in result

    async def test_reports_a_modified_file(self, git_repo, make_context) -> None:
        (git_repo / "a.txt").write_text("changed\n")
        ctx = make_context(git_repo)
        result = await get_git_status(context=ctx)
        assert "a.txt" in result

    async def test_reports_an_untracked_file(self, git_repo, make_context) -> None:
        (git_repo / "new.txt").write_text("new\n")
        ctx = make_context(git_repo)
        result = await get_git_status(context=ctx)
        assert "new.txt" in result

    async def test_not_a_git_repository_is_an_error_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await get_git_status(context=ctx)
        assert result.startswith("Error:")


class TestGitDiff:
    async def test_shows_the_diff_for_a_modified_file(self, git_repo, make_context) -> None:
        (git_repo / "a.txt").write_text("hello\nworld\n")
        ctx = make_context(git_repo)
        result = await git_diff(context=ctx, path="a.txt")
        assert "+world" in result

    async def test_no_changes(self, git_repo, make_context) -> None:
        ctx = make_context(git_repo)
        result = await git_diff(context=ctx)
        assert result == "(no changes)"
