from __future__ import annotations

from pathlib import Path

from app.agents.tools.file_tools import delete_file, list_directory, patch_file, read_file, write_file


class TestReadFile:
    async def test_reads_an_existing_file(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("hello")
        ctx = make_context(tmp_path)
        assert await read_file(path="a.txt", context=ctx) == "hello"

    async def test_path_outside_workspace_is_rejected(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await read_file(path="../../../etc/passwd", context=ctx)
        assert result.startswith("Error: Path outside workspace")

    async def test_missing_file_is_reported_as_an_observation_not_an_exception(
        self, tmp_path, make_context
    ) -> None:
        ctx = make_context(tmp_path)
        result = await read_file(path="nope.txt", context=ctx)
        assert result == "Error: File not found: nope.txt"

    async def test_never_calls_synchronous_path_read_text(self, tmp_path, make_context, monkeypatch) -> None:
        (tmp_path / "a.txt").write_text("hello")

        def _forbidden(self, *a, **k):
            raise AssertionError("read_file must use aiofiles, not Path.read_text")

        monkeypatch.setattr(Path, "read_text", _forbidden)
        ctx = make_context(tmp_path)
        assert await read_file(path="a.txt", context=ctx) == "hello"


class TestWriteFile:
    async def test_creates_a_new_file(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await write_file(path="new.txt", content="hi", context=ctx)
        assert "Wrote" in result
        assert (tmp_path / "new.txt").read_text() == "hi"

    async def test_overwrites_an_existing_file(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("old")
        ctx = make_context(tmp_path)
        await write_file(path="a.txt", content="new", context=ctx)
        assert (tmp_path / "a.txt").read_text() == "new"

    async def test_creates_parent_directories(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        await write_file(path="a/b/c.txt", content="hi", context=ctx)
        assert (tmp_path / "a" / "b" / "c.txt").read_text() == "hi"

    async def test_refuses_a_path_traversal_attempt(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await write_file(path="../escape.txt", content="pwned", context=ctx)
        assert result.startswith("Error: Path outside workspace")
        assert not (tmp_path.parent / "escape.txt").exists()

    async def test_never_calls_synchronous_path_write_text(self, tmp_path, make_context, monkeypatch) -> None:
        def _forbidden(self, *a, **k):
            raise AssertionError("write_file must use aiofiles, not Path.write_text")

        monkeypatch.setattr(Path, "write_text", _forbidden)
        ctx = make_context(tmp_path)
        await write_file(path="a.txt", content="hi", context=ctx)
        assert (tmp_path / "a.txt").read_text() == "hi"


class TestPatchFile:
    async def test_applies_a_valid_unified_diff(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("hello\nworld\n")
        ctx = make_context(tmp_path)
        diff = "--- a.txt\n+++ a.txt\n@@ -1,2 +1,2 @@\n hello\n-world\n+there\n"
        result = await patch_file(path="a.txt", diff=diff, context=ctx)
        assert "Applied patch" in result
        assert (tmp_path / "a.txt").read_text() == "hello\nthere\n"

    async def test_handles_a_patch_that_does_not_apply_gracefully(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("completely different content\n")
        ctx = make_context(tmp_path)
        diff = "--- a.txt\n+++ a.txt\n@@ -1,2 +1,2 @@\n hello\n-world\n+there\n"
        result = await patch_file(path="a.txt", diff=diff, context=ctx)
        assert result.startswith("Error:")

    async def test_missing_target_file_is_an_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await patch_file(path="nope.txt", diff="anything", context=ctx)
        assert result == "Error: File not found: nope.txt"

    async def test_refuses_a_path_traversal_attempt(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await patch_file(path="../escape.txt", diff="x", context=ctx)
        assert result.startswith("Error: Path outside workspace")


class TestDeleteFile:
    async def test_deletes_an_existing_file(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("hi")
        ctx = make_context(tmp_path)
        result = await delete_file(path="a.txt", context=ctx)
        assert "Deleted" in result
        assert not (tmp_path / "a.txt").exists()

    async def test_refuses_a_path_traversal_attempt(self, tmp_path, make_context) -> None:
        outside = tmp_path.parent / "sibling-target.txt"
        outside.write_text("do not delete me")
        try:
            ctx = make_context(tmp_path)
            result = await delete_file(path="../sibling-target.txt", context=ctx)
            assert result.startswith("Error: Path outside workspace")
            assert outside.exists()
        finally:
            outside.unlink(missing_ok=True)

    async def test_missing_file_is_an_observation(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await delete_file(path="nope.txt", context=ctx)
        assert result == "Error: File not found: nope.txt"


class TestListDirectory:
    async def test_lists_files_and_directories(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("hi")
        (tmp_path / "sub").mkdir()
        ctx = make_context(tmp_path)
        result = await list_directory(path=".", context=ctx)
        assert "file\ta.txt" in result
        assert "dir\tsub" in result

    async def test_empty_directory(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        assert await list_directory(path=".", context=ctx) == "(empty directory)"

    async def test_refuses_a_path_traversal_attempt(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await list_directory(path="..", context=ctx)
        assert result.startswith("Error: Path outside workspace")
