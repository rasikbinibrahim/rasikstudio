# AI Features

## Chat

`Ctrl+Shift+C` opens the AI Chat sidebar and focuses the input. Create a session, pick a model
(the picker is currently a fixed shortlist, not yet a live "what's actually installed" catalog —
see `TASKS.md`), and send a message. Replies stream in token-by-token in real time.

- **Attach the active file** — a toggle in the chat input adds your currently-open file as
  context for the next message. Drag-and-drop file attachment isn't built yet.
- **Workspace-aware context** — chat automatically pulls in relevant code from your workspace
  when it's been indexed (RAG). As of this writing, workspace indexing itself hasn't been built
  yet (it depends on background-task infrastructure that was never stood up — see ADR 0004), so
  in practice chat currently only has your explicitly-attached active file as context, not
  broader codebase search results.
- **Chat history persists** across app restarts — sessions and messages are stored server-side,
  not just in memory.

**Requires either:** a local [Ollama](https://ollama.com) server running with a pulled model, or
a cloud provider API key (Anthropic/OpenAI/Gemini) set in Settings. Nothing is fabricated if
neither is available — you'll get a real, visible error, not a fake response.

## Agent Tasks

The Agent Tasks sidebar (Activity Bar icon) lets you describe a task in natural language (e.g.
*"Add input validation to the login form"*) and an AI agent works through it autonomously —
reading files, running commands, editing code, using git — showing every step live as it happens.

- **Human approval gate.** High-risk actions (writing files, running shell commands, git
  operations) pause and wait for your explicit approval before executing — you'll see exactly
  what's about to happen and can approve or reject it.
- **Multiple agent types** — coder, debugger, researcher, reviewer, tester, doc-writer, and an
  orchestrator that can delegate to sub-agents for larger tasks.
- Every step is recorded (visible in the task's step timeline) and audited — approval decisions
  are durably logged, not just shown once and forgotten.

Same real-model requirement as chat above.

## Inline completions and code review

Named in this project's overall feature list but **not built as of Phase 16** — no inline
ghost-text completion provider and no dedicated "AI code review" feature exist yet. Not silently
omitted from this guide: tracked as genuinely open scope, not a documentation gap.

## Go-to-definition and hover (not AI, but often confused with it)

TypeScript/JavaScript/Python/JSON files get real hover-info and go-to-definition from a real
language server, unrelated to any AI provider — see `GETTING_STARTED.md`. This works even with no
AI configured at all.
