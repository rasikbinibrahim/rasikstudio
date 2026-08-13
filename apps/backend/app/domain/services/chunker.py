from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import tiktoken

# RAG_SYSTEM.md §3.2's "Included" list. Extension -> language name, used both to filter which
# files get indexed at all and to populate `code_embeddings.language`.
LANGUAGE_BY_EXTENSION: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".swift": "swift",
    ".kt": "kotlin",
    ".php": "php",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".sql": "sql",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".toml": "toml",
    ".md": "markdown",
}
INDEXABLE_EXTENSIONS = frozenset(LANGUAGE_BY_EXTENSION)

# RAG_SYSTEM.md §3.2's "Excluded" directory list — kept as the one shared source
# `agents/tools/search_tools.py` also imports, rather than two independently-tuned copies of
# "what counts as noise" silently drifting apart.
EXCLUDED_DIR_NAMES = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        "dist",
        "build",
        "out",
        ".next",
        "target",
        ".venv",
        ".turbo",
        ".pnpm-store",
        "dist-electron",
    }
)

MAX_FILE_SIZE_BYTES = 500_000
# RAG_SYSTEM.md §3.2: a file over the size cap is still indexed, just truncated to its first
# 10K characters rather than skipped outright — a huge generated file's *header* (imports, top
# of the first class) is still more useful to retrieve than nothing.
MAX_TRUNCATED_CHARS = 10_000

_CHUNK_SIZE_TOKENS = 512
_CHUNK_OVERLAP_TOKENS = 64
_ENCODING = tiktoken.get_encoding("cl100k_base")


def language_for(path: Path) -> str | None:
    return LANGUAGE_BY_EXTENSION.get(path.suffix.lower())


def is_indexable(path: Path) -> bool:
    return path.suffix.lower() in INDEXABLE_EXTENSIONS


@dataclass(frozen=True, slots=True)
class TextChunk:
    index: int
    content: str
    start_line: int
    end_line: int


def chunk_text(
    content: str,
    *,
    chunk_size_tokens: int = _CHUNK_SIZE_TOKENS,
    overlap_tokens: int = _CHUNK_OVERLAP_TOKENS,
) -> list[TextChunk]:
    """Fixed-size chunking with overlap — RAG_SYSTEM.md §3.3's documented *fallback* strategy
    (the AST-aware `chunk_by_ast` alternative it also describes needs a tree-sitter grammar per
    language, real additional scope not built here; see `TASKS.md`). Chunk boundaries are token
    boundaries (via `tiktoken`'s `cl100k_base`, the same encoding `tokenizer_registry.py`'s
    approximate counter uses), not line or character boundaries, so `start_line`/`end_line` are
    derived *from* each chunk's actual decoded text rather than computed independently — decoding
    a token slice back to text is the only reliable way to know exactly which characters (and
    therefore which lines) of the original content it corresponds to.
    """
    if not content.strip():
        return []

    tokens = _ENCODING.encode(content, disallowed_special=())
    if not tokens:
        return []

    stride = max(chunk_size_tokens - overlap_tokens, 1)
    chunks: list[TextChunk] = []
    start = 0
    index = 0
    while start < len(tokens):
        end = min(start + chunk_size_tokens, len(tokens))
        chunk_str = _ENCODING.decode(tokens[start:end])
        prefix = _ENCODING.decode(tokens[:start])
        start_line = prefix.count("\n") + 1
        end_line = start_line + chunk_str.count("\n")
        chunks.append(TextChunk(index=index, content=chunk_str, start_line=start_line, end_line=end_line))
        index += 1
        if end == len(tokens):
            break
        start += stride

    return chunks
