from __future__ import annotations

from pathlib import Path

from app.domain.services.chunker import (
    EXCLUDED_DIR_NAMES,
    INDEXABLE_EXTENSIONS,
    chunk_text,
    is_indexable,
    language_for,
)


class TestLanguageAndIndexability:
    def test_recognizes_a_real_source_extension(self) -> None:
        assert language_for(Path("app/main.py")) == "python"
        assert is_indexable(Path("app/main.py")) is True

    def test_extension_matching_is_case_insensitive(self) -> None:
        assert language_for(Path("README.MD")) == "markdown"

    def test_an_unknown_extension_is_not_indexable(self) -> None:
        assert language_for(Path("image.png")) is None
        assert is_indexable(Path("image.png")) is False

    def test_a_binary_looking_extension_is_excluded(self) -> None:
        assert is_indexable(Path("archive.zip")) is False

    def test_excluded_dir_names_cover_the_common_noise_directories(self) -> None:
        for name in ("node_modules", ".git", "dist", "build", "__pycache__", ".venv"):
            assert name in EXCLUDED_DIR_NAMES

    def test_indexable_extensions_cover_the_common_source_languages(self) -> None:
        for ext in (".py", ".ts", ".tsx", ".go", ".rs", ".md", ".json"):
            assert ext in INDEXABLE_EXTENSIONS


class TestChunkText:
    def test_empty_content_produces_no_chunks(self) -> None:
        assert chunk_text("") == []
        assert chunk_text("   \n  \n") == []

    def test_short_content_produces_exactly_one_chunk_covering_everything(self) -> None:
        content = "def foo():\n    return 1\n"
        chunks = chunk_text(content)
        assert len(chunks) == 1
        assert chunks[0].content == content
        assert chunks[0].index == 0
        assert chunks[0].start_line == 1

    def test_content_longer_than_one_chunk_produces_multiple_overlapping_chunks(self) -> None:
        # Each line is its own token-heavy unit; 200 lines is comfortably more than the 512-token
        # chunk size, forcing a real split.
        content = "\n".join(f"line_{i} = {i}" for i in range(200))

        chunks = chunk_text(content, chunk_size_tokens=64, overlap_tokens=8)

        assert len(chunks) > 1
        assert [c.index for c in chunks] == list(range(len(chunks)))
        # Every chunk after the first repeats some tail content from the one before it — that's
        # what "overlap" means; assert it holds by checking start_line only advances, never jumps
        # backward or skips (an off-by-one in the stride math would show up as either).
        for earlier, later in zip(chunks, chunks[1:], strict=False):
            assert later.start_line > earlier.start_line
            assert later.start_line <= earlier.end_line + 1

    def test_the_last_chunk_reaches_the_end_of_the_content(self) -> None:
        content = "\n".join(f"line_{i} = {i}" for i in range(200))
        chunks = chunk_text(content, chunk_size_tokens=64, overlap_tokens=8)
        assert chunks[-1].end_line == content.count("\n") + 1

    def test_start_and_end_line_are_1_indexed_and_consistent_with_real_line_breaks(self) -> None:
        content = "first\nsecond\nthird\nfourth\nfifth"
        chunks = chunk_text(content, chunk_size_tokens=3, overlap_tokens=0)
        assert chunks[0].start_line == 1
        # However many chunks this splits into, every chunk's own newline count must match
        # end_line - start_line exactly.
        for chunk in chunks:
            assert chunk.end_line - chunk.start_line == chunk.content.count("\n")

    def test_zero_overlap_chunks_do_not_repeat_content(self) -> None:
        content = "\n".join(f"line_{i} = {i}" for i in range(100))
        chunks = chunk_text(content, chunk_size_tokens=32, overlap_tokens=0)
        reassembled = "".join(c.content for c in chunks)
        assert reassembled == content
