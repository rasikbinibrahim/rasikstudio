# Continue — Reference Analysis

**Studied as of:** 2026-08-12. Continue is an open-source AI coding assistant shipping as both a
VS Code and a JetBrains extension, providing chat, inline completions, and "edit" (apply a diff
to selected code) against a configurable set of local/cloud model providers. Referenced for this
project's own AI Chat (Phase 10) — the context-assembly order and streaming-delivery pattern below
both have a direct, already-built counterpart in `apps/backend/app/application/chat/`.

## 1. Architecture

Split into a **core** package (TypeScript, provider-agnostic — context providers, the LLM
abstraction, prompt templates) shared across both IDE extensions, and two thin IDE-specific
adapters that wire `core`'s API into VS Code's/JetBrains' own extension surfaces. Chat and
completion are two genuinely separate features with separate trigger paths: chat is
explicit-request/response (the same shape this project's `POST /chat/sessions/{id}/messages`
uses), while completion is a debounced, cursor-position-triggered background request that must
return fast enough to feel inline (typically <300ms for a usable experience) — this project has
not built inline completions at all (`docs/user-guide/AI_FEATURES.md` states this plainly; see
`COMPLETION_NOTES.md` for the full comparison and why).

## 2. Folder Structure

`core/context/providers/` — one file per context source (`@file`, `@codebase`, `@docs`,
`@terminal`, `@diff`, ...), each implementing a shared `IContextProvider` interface that returns
context items given a query. This "pluggable context provider" abstraction is the single most
useful structural idea to compare against this project's own, much simpler
`context_builder.build_chat_context()` (`apps/backend/app/application/chat/context_builder.py`),
which currently has exactly two hardcoded context sources (`active_file`, RAG search) rather than
an extensible provider list — see `CONTEXT_BUILDING_NOTES.md`.

## 3. Design Patterns

- **Slash commands and `@`-mentions as a structured input grammar** — `/edit`, `/comment`,
  `@file`, `@codebase` are parsed out of the chat input before the message is sent, each
  triggering different context-assembly and prompt-template behavior. This project's `ChatInput`
  has one toggle ("attach the active file") and no slash-command grammar at all — a much smaller,
  single-purpose surface. Extending Continue-style `@`-mentions (e.g. `@file path/to/x.ts` to
  attach an arbitrary file, not just the currently active one) is a real, larger feature than the
  drag-and-drop file attach `TASKS.md` already tracks as deferred — worth naming as the more
  general version of that same gap.
- **Config-driven provider/model selection** (`config.json`/`config.ts`, a user-editable file
  listing every configured model + its role — chat, edit, autocomplete, embed — each can use a
  different provider/model). This project's model selection is per-session, chosen from a
  hardcoded shortlist at "New Chat" time (`ChatSessionList.tsx`'s `DEFAULT_MODELS`, already
  tracked in `TASKS.md` as a gap versus a live `GET /api/v1/models` fetch) — Continue's
  role-based config (a *different* model for chat vs. completion vs. embedding) is a more granular
  version of what this project's separate `ModelRouter`/`EmbeddingService` fallback chains
  (`config/fallback_chains.yaml`) already do server-side, just not user-configurable from the UI.
- **Streaming assembly via incremental deltas rendered as markdown** — the same pattern this
  project's `ChatMessage.tsx`/`createStreamBatcher` (`chat-slice.ts`) implements: buffer deltas,
  flush at most once per animation frame, render the growing string as markdown throughout
  (not just once at the end).

## 4. Dependencies

TypeScript throughout (both `core` and both IDE adapters) — no separate backend service; Continue
runs entirely inside the host IDE's own extension process, calling model provider APIs directly.
This project's chat backend is a real separate service (FastAPI + Postgres for session/message
persistence + Redis for streaming pub/sub) — a structural difference driven by the same reasoning
as the Cline comparison: this project's editor *is* the product, with its own backend, not an
extension riding on an existing IDE's extension host.

## 5. Build Process

`core` builds as a plain TypeScript library; each IDE adapter has its own packaging (`vsce
package` for VS Code, a Gradle-based plugin build for JetBrains) consuming `core` as a dependency.
The shared-core/thin-adapter split is the reusability lesson most transferable to this project *if*
a second frontend (e.g. a web version) were ever built: keep AI logic (context assembly, prompt
templates, provider calls) in the backend service (already true here — `context_builder.py`/
`ModelRouter` are backend-only, the desktop app is a pure client of them) rather than duplicating
it per-frontend, the mistake Continue's split explicitly avoids by design.

## 6. Features

Chat with configurable context providers (§2); inline "Tab-to-complete" ghost-text completions;
"Edit" mode (select code, describe a change, get a diff applied in place — closer to this
project's agent `patch_file` tool than to chat); a local, on-disk conversation history the user
can browse/search across sessions. This project's chat history is real and persisted (Postgres
`chat_sessions`/`messages`, survives app restarts — one of Phase 10's own acceptance criteria) but
has no cross-session search UI yet.

## 7. Strengths

- The pluggable context-provider abstraction (§2/§3) scales cleanly to new context sources
  without touching the core assembly logic — genuinely worth adopting if this project's context
  sources grow past the current two.
- Config-driven, role-based model selection (§3) gives users real control without code changes.
- Shared core across two different IDE hosts (§5) proves the "keep AI logic host-agnostic" design
  is achievable in practice, not just in theory.

## 8. Weaknesses

- Running entirely client-side (no backend service) means no server-side persistence, no
  multi-device session sync, and every user's own API keys/config live in local IDE settings —
  fine for a personal tool, a real limitation this project's backend-service architecture avoids.
- Slash-command/context-provider grammar (§3) is real UI complexity a simpler tool doesn't need;
  this project's smaller surface (one attach toggle) is easier to learn at the cost of being less
  powerful — a reasonable tradeoff for this project's current maturity, not necessarily permanent.

## 9. Reusable Modules

None imported directly (Apache 2.0 permits it — see `LICENSE_NOTES.md` — but TypeScript-for-an-
IDE-extension's `core` package isn't a drop-in for this project's Python backend). The idea worth
carrying forward, not yet acted on: generalizing `context_builder.py`'s two hardcoded context
sources into something closer to Continue's pluggable provider list, named as a real follow-up in
`CONTEXT_BUILDING_NOTES.md`, not previously tracked in `TASKS.md`.

## 10. Modules That Should Be Rewritten (if ever adopting Continue code directly)

The entire context-provider interface and prompt-template system would need translation from
TypeScript-in-an-extension-process to Python-in-a-FastAPI-service before being usable here — not
a mechanical port, since Continue's providers assume synchronous access to the host IDE's own
editor state (open files, selections) that this project's backend only has if the desktop app
explicitly sends it over the API (the same limitation `context_builder.py`'s own docstring already
names for "recently opened files"/"active terminal output").

## 11. License Requirements

See `LICENSE_NOTES.md`.
