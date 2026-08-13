# Continue — Context Building Notes

How Continue assembles context from files, docs, and conversation, and how this project's own
`build_chat_context()` (`apps/backend/app/application/chat/context_builder.py`) compares.

## Continue's model: pluggable context providers

Every context source — the currently open file, a `@codebase` semantic search, `@docs` (indexed
documentation sites), `@terminal` (recent terminal output), `@diff` (the current git diff), a
`@url` fetch — implements one shared `IContextProvider` interface: given the user's query (and
any provider-specific arguments from an `@mention`), return a list of context items (each with
its own content and a description used both for display and for the prompt). The chat input's
`@`-mention grammar is the UI surface that lets a user explicitly choose which providers fire for
a given message, rather than every provider running on every message.

## This project's model: two hardcoded sources, always both attempted

`build_chat_context()` (`context_builder.py:24`) has exactly two context sources, both always
attempted (not user-selectable per message):

1. **Active file** (`ActiveFileContext`) — whatever file the desktop app says is currently open,
   sent whole (path + content) if the `ChatInput` "attach the active file" toggle is on.
2. **RAG search** (`_retrieve_rag_context()`) — a `RAG_TOP_K = 5` semantic search against
   `EmbeddingRepository.search()` (pgvector, `code_embeddings`), degrading silently to no results
   (not an error) on an unindexed workspace or a provider failure — see that function's own
   docstring for the exact fallback behavior.

Both are assembled into one `system`-role message (not the first system message — the fixed
`_DEFAULT_SYSTEM_PROMPT`/session's own `system_prompt` is first, workspace context second, per
`AI_ARCHITECTURE.md` §4's documented order), then conversation history, then the current user
message — the same four-stage ordering Continue's own prompt template applies (system instruction
→ retrieved/attached context → conversation → current turn), independently arrived at as the
obvious ordering for this kind of assembly, not copied.

## What Continue's design offers that this project's doesn't

- **User-selectable context per message** (`@file somepath.ts`, `@codebase "how does auth work"`)
  — this project's RAG search always runs against the *current user message's own text* as the
  query; there's no way for a user to explicitly attach a *different* file than the active one, or
  scope a search themselves. The already-deferred "drag-and-drop file attach" (`TASKS.md`, Phase
  10) is the narrow version of this gap; a full `@`-mention grammar would be the general version,
  not currently tracked as its own item.
- **`@docs`-style external content indexing** — this project's RAG index only covers the
  workspace's own code (`infrastructure/rag/indexer.py` walks the workspace directory); there's no
  way to index and retrieve from external documentation. Out of scope for `RAG_SYSTEM.md`'s
  current design, not a gap in what was built against what was planned.
- **`@terminal`/`@diff` context** — `context_builder.py`'s own docstring already names "active
  terminal output" as deliberately not built (no IPC plumbing exists to hand it over); git diff
  context specifically isn't named there either — a real, additional gap this analysis surfaces:
  the agent's own `git_diff` tool exists (`agents/tools/git_tools.py`) but chat's context builder
  has no equivalent for "include the current uncommitted diff" the way Continue's `@diff` does.

## Worth adopting: the provider-interface shape, not necessarily the `@`-mention UI

If this project's context sources grow (e.g. the "recently opened files"/"active terminal
output"/git-diff gaps above all eventually get built), refactoring `context_builder.py` from two
hardcoded function calls into a small `ContextProvider` protocol (`name`, `async def
fetch(query, workspace_id, ...) -> list[str]`) would let each source be added/tested/toggled
independently, the same structural benefit Continue's design gets — without necessarily also
building the full `@`-mention chat-input grammar, which is a separate, bigger UI decision.
