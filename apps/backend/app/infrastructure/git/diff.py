from __future__ import annotations

import asyncio
from pathlib import Path

# Matches `application/git/generate_commit_message.py`'s own `MAX_DIFF_CHARS` — a diff can be
# enormous (binary-adjacent, generated files) well before `ModelRouter`'s own token-budget
# truncation would catch it, and an oversized diff shouldn't be able to starve the rest of a
# chat message's context of its own budget.
_MAX_DIFF_CHARS = 20_000


async def get_working_tree_diff(workspace_root: Path, path: str | None = None) -> str:
    """Real `git diff` output for the workspace's uncommitted changes — used by
    `application/chat/context_builder.py`'s optional "include the current uncommitted diff" chat
    context, the gap named by comparing this project against Continue's own `@diff` context
    provider (`docs/reference/continue/CONTEXT_BUILDING_NOTES.md`).

    Deliberately not shared with `agents/tools/git_tools.py`'s own `git_diff` tool despite the
    similar subprocess call: that tool needs to distinguish "git failed" (returns a descriptive
    `"Error: ..."` string the agent reasons over) from "no changes" (a real, valid empty diff) —
    two outcomes an agent tool's caller needs told apart. This function instead always degrades
    to `""` on any failure, matching how RAG search / embedding failures already degrade
    elsewhere in this same chat context pipeline: silently, never blocking the message itself.
    Forcing one shared function to serve both call sites' different error semantics (via extra
    flags/callbacks) would add more complexity than the ~10 duplicated lines it would save."""
    args = ["diff", "--", path] if path else ["diff"]
    try:
        process = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=str(workspace_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await process.communicate()
    except OSError:
        return ""
    if process.returncode != 0:
        return ""
    return stdout.decode(errors="replace")[:_MAX_DIFF_CHARS]
