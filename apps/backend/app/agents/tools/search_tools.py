from __future__ import annotations

import asyncio

import aiofiles.os

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool
from app.core.config import get_settings
from app.domain.services.chunker import EXCLUDED_DIR_NAMES as _EXCLUDED_DIR_NAMES
from app.domain.services.path_validator import WorkspacePathError, resolve_workspace_path
from app.infrastructure.ai.embedding_service import EmbeddingService
from app.infrastructure.ai.model_router import load_fallback_chains
from app.infrastructure.ai.providers import ai_providers
from app.infrastructure.db.repositories.embedding_repository import EmbeddingRepository
from app.infrastructure.db.session import AsyncSessionLocal

# Same exclusion set `apps/desktop/electron/main/ipc/file-handlers.ts`'s `files:listAll` uses for
# quick-open, and the same set `domain/services/chunker.py`'s RAG indexing pipeline uses — kept in
# one shared place (rather than 2-3 independently-tuned copies) so "what the agent can search",
# "what gets indexed for semantic search", and "what the user's own file explorer shows" can't
# silently diverge from each other.
_MAX_RESULTS = 500


@tool(
    name="search_files",
    description="Find files in the workspace by glob pattern (e.g. '**/*.py')",
    parameters={
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Glob pattern, relative to workspace root"}
        },
        "required": ["pattern"],
    },
    risk=RiskLevel.LOW,
)
async def search_files(pattern: str, context: AgentContext) -> str:
    root = context.workspace_root.resolve()

    def _search() -> list[str]:
        matches: list[str] = []
        for path in root.glob(pattern):
            if len(matches) >= _MAX_RESULTS:
                break
            if any(part in _EXCLUDED_DIR_NAMES for part in path.relative_to(root).parts[:-1]):
                continue
            if path.is_file():
                matches.append(str(path.relative_to(root)))
        return sorted(matches)

    matches = await asyncio.to_thread(_search)
    return "\n".join(matches) if matches else "(no matches)"


@tool(
    name="grep",
    description="Search file contents in the workspace for a text pattern",
    parameters={
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Text or regex pattern to search for"},
            "path": {
                "type": "string",
                "description": "Relative path to search within (default: workspace root)",
            },
        },
        "required": ["pattern"],
    },
    risk=RiskLevel.LOW,
)
async def grep(pattern: str, context: AgentContext, path: str = ".") -> str:
    try:
        search_root = resolve_workspace_path(context.workspace_root, path)
    except WorkspacePathError:
        return f"Error: Path outside workspace: {path}"
    if not await aiofiles.os.path.isdir(search_root) and not await aiofiles.os.path.isfile(search_root):
        return f"Error: Path not found: {path}"

    exclude_args = [arg for name in _EXCLUDED_DIR_NAMES for arg in ("--exclude-dir", name)]
    process = await asyncio.create_subprocess_exec(
        "grep",
        "-r",
        "-n",
        "-I",  # skip binary files
        *exclude_args,
        "-e",
        pattern,
        str(search_root),
        cwd=str(context.workspace_root),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()

    if process.returncode not in (0, 1):  # grep: 0 = matches found, 1 = no matches, >1 = error
        return f"Error: grep failed: {stderr.decode(errors='replace').strip()}"

    output = stdout.decode(errors="replace").strip()
    if not output:
        return "(no matches)"
    lines = output.splitlines()[:_MAX_RESULTS]
    root_prefix = str(context.workspace_root.resolve()) + "/"
    return "\n".join(line.removeprefix(root_prefix) for line in lines)


@tool(
    name="search_semantic",
    description="Semantic (embedding-based) search over the workspace's indexed code",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Natural-language search query"},
            "top_k": {"type": "integer", "description": "Number of results to return (default 5)"},
        },
        "required": ["query"],
    },
    risk=RiskLevel.LOW,
)
async def search_semantic(query: str, context: AgentContext, top_k: int = 5) -> str:
    """Embeds `query` and searches `code_embeddings` for the workspace — returns nothing (not an
    error) if the workspace hasn't been indexed yet (`POST /workspaces/{id}/index`,
    `infrastructure/rag/indexer.py`), since that's an honest, expected state before anyone has
    triggered an index run, not a failure. Indexing itself is a separate pipeline, not this tool's
    job; `search_semantic` only ever reads."""
    settings = get_settings()
    embedding_service = EmbeddingService(ai_providers, load_fallback_chains(settings.fallback_chains_path))
    try:
        vectors = await embedding_service.embed([query])
    except Exception as exc:
        return f"Error: Embedding the query failed: {exc}"

    async with AsyncSessionLocal() as session:
        results = await EmbeddingRepository(session).search(
            workspace_id=context.workspace_id, query_embedding=vectors[0], top_k=top_k
        )

    if not results:
        return "(no indexed results — this workspace may not be indexed yet)"

    lines = [f"{r.metadata.get('file_path', '?')} (distance={r.distance:.4f}):\n{r.content}" for r in results]
    return "\n\n".join(lines)


SEARCH_TOOLS = [search_files, grep, search_semantic]
