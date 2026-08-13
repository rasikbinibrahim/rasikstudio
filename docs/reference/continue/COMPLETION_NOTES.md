# Continue — Inline Completion Notes

Inline completion trigger, debounce, and caching, and why this project has not built the
equivalent feature.

## Continue's inline completion pipeline

1. **Trigger**: cursor moves or a keystroke fires in an idle-detection window (typically ~300ms
   debounce after the last keystroke — long enough to avoid firing on every character while
   typing quickly, short enough to still feel responsive once the user pauses).
2. **Context assembly**: the current file's content around the cursor (prefix + suffix, not the
   whole file for large files — token-budget-bounded), optionally enriched with nearby-file/
   symbol context for repo-aware completions.
3. **Request**: sent to a model specifically configured for the `autocomplete` role (Continue's
   config supports a different, typically smaller/faster, model than the one used for chat —
   e.g. a 1.5B-parameter local model rather than a full-size chat model, since completion latency
   budget is much tighter).
4. **Caching**: identical (or prefix-compatible) requests within a short window are served from
   cache rather than re-hitting the model — completion requests fire far more often than chat
   messages (every idle pause while typing, not once per explicit send), so caching materially
   reduces both latency and cost/local-compute load.
5. **Ghost-text rendering**: the completion is shown as dimmed inline "ghost text" the user can
   accept with Tab or dismiss by continuing to type/pressing Escape — a Monaco/VS Code
   `InlineCompletionsProvider`-shaped API in both cases, since both editors are built on the same
   underlying `monaco-editor` engine (see the Monaco reference analysis).

## Why this project hasn't built this

**Real, explicitly documented status, not an oversight:** `docs/user-guide/AI_FEATURES.md` states
plainly that inline code completions were never built — `PROGRESS.md`'s Phase 18 entry
independently confirms this while explaining why `cachetools.TTLCache`-for-a-completion-cache (a
literal acceptance criterion from `phase-18-optimization.md`'s own Testing Strategy) is marked
"not applicable" rather than done: there is no completion-cache feature to apply it to, because
there is no completion feature. This project's own `MODEL_ROUTER.md` §6/Decisions Log names
`qwen2.5-coder:1.5b` as the intended default completion model (the same "smaller model for
completion" instinct Continue's role-based config expresses) — the *routing infrastructure*
(`ModelRouter`, `CONTEXT_WINDOWS`, fallback chains) is real and would support a completion feature
if built, but nothing calls it for that purpose today.

## What building this would require, sized against what already exists

- **Monaco wiring**: `MonacoEditor.tsx`/`lsp-client.ts` already register real Monaco providers
  (hover, go-to-definition — see the LSP integration, Phase 3) — an `InlineCompletionsProvider`
  would follow the same registration pattern, a real but bounded addition, not a new subsystem.
- **Debounce + prefix/suffix extraction**: new frontend logic, no backend dependency.
- **A completion-specific backend endpoint** (or reusing `ModelRouter.complete()` directly from a
  new lightweight route) — the routing/provider/fallback-chain infrastructure this needs already
  exists (Phase 9); only the endpoint and its prompt-template are new.
- **Caching**: exactly the gap `PERFORMANCE_GUIDE.md`'s own Testing Strategy already names
  (`cachetools.TTLCache`) — sized correctly for a real future implementation, not oversized for a
  feature this small.

Not scheduled in any of the 18 roadmap phases — flagged here as a real, buildable feature with a
known shape, not a speculative one, should it ever be prioritized.
