from __future__ import annotations

import pytest

from app.domain.services.path_validator import WorkspacePathError, resolve_workspace_path


class TestResolveWorkspacePath:
    def test_resolves_a_path_inside_the_workspace(self, tmp_path) -> None:
        (tmp_path / "sub").mkdir()
        result = resolve_workspace_path(tmp_path, "sub/file.txt")
        assert result == (tmp_path / "sub" / "file.txt").resolve()

    def test_resolves_the_workspace_root_itself(self, tmp_path) -> None:
        assert resolve_workspace_path(tmp_path, ".") == tmp_path.resolve()

    def test_rejects_parent_directory_traversal(self, tmp_path) -> None:
        with pytest.raises(WorkspacePathError):
            resolve_workspace_path(tmp_path, "../../../etc/passwd")

    def test_rejects_escaping_to_the_parent_directory(self, tmp_path) -> None:
        with pytest.raises(WorkspacePathError):
            resolve_workspace_path(tmp_path, "..")

    def test_rejects_a_sibling_directory_sharing_a_name_prefix(self, tmp_path) -> None:
        # A naive `str.startswith(root)` check would let this through since
        # f"{tmp_path}-evil" starts with str(tmp_path) — the real check must not be fooled.
        sibling = tmp_path.parent / f"{tmp_path.name}-evil"
        sibling.mkdir()
        try:
            relative = f"../{sibling.name}/secret.txt"
            with pytest.raises(WorkspacePathError):
                resolve_workspace_path(tmp_path, relative)
        finally:
            sibling.rmdir()

    def test_allows_nested_subdirectories(self, tmp_path) -> None:
        (tmp_path / "a" / "b" / "c").mkdir(parents=True)
        result = resolve_workspace_path(tmp_path, "a/b/c/file.txt")
        assert result == (tmp_path / "a" / "b" / "c" / "file.txt").resolve()
