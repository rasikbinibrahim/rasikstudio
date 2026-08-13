# Cline — Tool Design Notes

How Cline defines and executes tools, and how this project's own `ToolRegistry`
(`apps/backend/app/agents/tools/registry.py`) compares.

## How Cline defines a tool

Each tool is defined as a name, a description (fed to the model as part of the system prompt, in
Cline's own hand-formatted tool-use instructions), a set of parameters described in prose (not a
JSON Schema — a consequence of Cline supporting models without native function-calling, see the
main `ANALYSIS.md` §3), and a handler. Cline's tool set covers roughly: `read_file`, `write_to_
file`, `replace_in_file` (a diff/patch-style edit, not a full overwrite), `search_files`,
`list_files`, `execute_command`, `browser_action`, `ask_followup_question` (the model can ask the
user a clarifying question mid-task, not just report failure), and `attempt_completion`.

This project's own tool set (`agents/tools/{file,search,shell,git,test,agent,browser,
interaction}_tools.py`, 19 tools built — see `AGENT_FRAMEWORK.md`'s tool table) is close in
shape: `read_file`/`write_file`/`patch_file`/`delete_file`/`list_directory` cover the same
filesystem surface (`patch_file` is this project's `replace_in_file` equivalent), `search_files`/
`grep`/`search_semantic` cover search, `run_command` covers `execute_command`. One real
difference remains:

- **Resolved 2026-08-13:** `ask_followup_question` — this analysis originally flagged its total
  absence as a real, un-tracked gap. `agents/tools/interaction_tools.py` now provides a real
  equivalent (registered for every agent type), reusing `running_tasks.py`'s existing one-shot
  Redis hand-off rather than a new mechanism. See `AGENT_FRAMEWORK.md` §4's writeup and
  `CHANGELOG.md`'s 2026-08-13 entry.
- **Native tool-calling instead of parsed model output.** Every tool this project registers is
  described via a real JSON Schema (`parameters: dict[str, object]`, converted to the `Tool` shape
  `AIProvider.complete()` sends the provider — see `registry.py`'s `as_ai_tools()`), and the model
  returns structured `ToolCall`s the provider SDK itself parsed, not free-text this project has to
  parse. This is strictly simpler and more reliable than Cline's approach, at the cost of only
  supporting models with real function-calling (all four of this project's providers — Ollama,
  Anthropic, OpenAI, Gemini — do).

## How Cline executes a tool

Model output is streamed and parsed incrementally (partial XML-like tags get assembled as chunks
arrive) — genuinely more complex than this project's approach, since a tool call can only be
fully known once the whole call has streamed in, but the UI still wants to show "the model is
calling `write_to_file`..." before that's confirmed. This project's `ModelRouter.stream()` also
streams, but tool calls are only ever returned from the non-streaming `complete()` path in the
current agent loop (`BaseAgent.run()` calls `self._router.complete(...)`, not `.stream(...)`) —
simpler, at the cost of not showing "agent is about to call X" progressively before the full
response arrives. A real, deliberate simplicity/latency tradeoff, not an oversight.

## Error handling

Cline surfaces a tool failure back to the model as an observation (the model sees the error and
can retry/adjust), the same "never crash the task, feed the failure back as text" principle this
project's `ToolRegistry.execute()` implements — see that method's own docstring
(`registry.py:81`): unknown tool, bad arguments, and an unhandled exception in the tool body all
become an `"Error: ..."` string result rather than propagating, so a single bad tool call doesn't
abort the whole agent task. Independently arrived at (this is close to the only sane design for a
ReAct loop — an agent that can't observe its own tool failures can't recover from them), not
copied, but worth noting the convergence as validation of the approach.
