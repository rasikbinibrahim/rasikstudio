from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import structlog

from app.domain.models.chat import Message as DomainMessage
from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.embedding_service import EmbeddingService
from app.infrastructure.db.repositories.embedding_repository import EmbeddingRepository
from app.infrastructure.git.diff import get_working_tree_diff

logger = structlog.get_logger("application.chat.context_builder")

RAG_TOP_K = 5
_DEFAULT_SYSTEM_PROMPT = "You are an AI coding assistant working inside Rasik Studio IDE."


@dataclass(frozen=True, slots=True)
class ActiveFileContext:
    path: str
    content: str


async def build_chat_context(
    *,
    system_prompt: str | None,
    workspace_id: UUID,
    active_file: ActiveFileContext | None,
    history: list[DomainMessage],
    user_message: str,
    embedding_service: EmbeddingService,
    embedding_repo: EmbeddingRepository,
    workspace_root: Path | None = None,
    include_git_diff: bool = False,
) -> list[Message]:
    """Assembles the ordered message list `ModelRouter.stream()` sends to the provider, per
    `AI_ARCHITECTURE.md` §4's context-building order: system prompt -> workspace context (active
    file + git diff + RAG results) -> conversation history -> current user message.
    Context-window truncation itself is `ModelRouter`'s job
    (`context_manager.truncate_messages()`), not this function's — this only decides *what* goes
    in, not how much of it fits.

    `include_git_diff`/`workspace_root` mirror `active_file`'s own opt-in shape (the desktop
    sends it only when the user has the toggle on) — the real gap this closes: `context_builder.py`
    previously had no equivalent of Continue's own `@diff` context provider
    (`docs/reference/continue/CONTEXT_BUILDING_NOTES.md`), even though the agent's own `git_diff`
    tool already had this exact capability for agent tasks. `workspace_root` is optional (`None`
    when the caller can't resolve it, e.g. no matching `Workspace` row) — a missing root degrades
    the same way a `git diff` failure does, silently, never blocking the message.

    Deliberately not built (see `TASKS.md`): "recently opened files" and "active terminal output"
    from `AI_ARCHITECTURE.md` §4's workspace-context list. The backend has no visibility into
    desktop UI state (which files are open, what's in the terminal) without new IPC/API plumbing
    that doesn't exist yet — `active_file` (and now the git diff) are the pieces the desktop app
    can realistically hand the API today.
    """
    messages: list[Message] = [Message(role="system", content=system_prompt or _DEFAULT_SYSTEM_PROMPT)]

    context_parts: list[str] = []
    if active_file is not None:
        context_parts.append(f"## Active file: {active_file.path}\n```\n{active_file.content}\n```")

    if include_git_diff and workspace_root is not None:
        diff = await get_working_tree_diff(workspace_root)
        if diff.strip():
            context_parts.append(f"## Uncommitted changes (git diff)\n```diff\n{diff}\n```")

    rag_chunks = await _retrieve_rag_context(
        workspace_id, user_message, embedding_service=embedding_service, embedding_repo=embedding_repo
    )
    if rag_chunks:
        context_parts.append("## Relevant code from the workspace\n" + "\n\n".join(rag_chunks))

    if context_parts:
        messages.append(Message(role="system", content="\n\n".join(context_parts)))

    for item in history:
        if item.role == "system":
            continue  # the session's own system_prompt is already the first message
        messages.append(
            Message(role=item.role, content=item.content, tool_calls=None, tool_call_id=item.tool_call_id)
        )

    messages.append(Message(role="user", content=user_message))
    return messages


async def _retrieve_rag_context(
    workspace_id: UUID,
    query: str,
    *,
    embedding_service: EmbeddingService,
    embedding_repo: EmbeddingRepository,
) -> list[str]:
    """Real retrieval against `code_embeddings` — returns an empty list, not fabricated results,
    for any workspace that hasn't actually been indexed yet (`POST /workspaces/{id}/index`,
    `infrastructure/rag/indexer.py` — real since 2026-08-11, but only for workspaces someone has
    explicitly triggered an index run for; there's no automatic trigger on workspace open yet).
    Until a workspace is indexed, this degrades to "no RAG context," never a wrong or made-up
    answer."""
    try:
        [query_embedding] = await embedding_service.embed([query])
    except Exception:
        # Embedding the query is best-effort context enrichment, not a hard dependency of sending
        # a chat message — an embedding-provider outage shouldn't block the chat itself.
        logger.warning("rag_query_embedding_failed", workspace_id=str(workspace_id))
        return []

    results = await embedding_repo.search(
        workspace_id=workspace_id, query_embedding=query_embedding, top_k=RAG_TOP_K
    )
    return [f"`{r.metadata.get('file_path')}`:\n```\n{r.content}\n```" for r in results]
