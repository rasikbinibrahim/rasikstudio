# OpenHands — Reference Analysis

**Studied as of:** 2026-08-12. OpenHands (formerly OpenDevin) is an autonomous AI software
engineering platform: a backend service (not an editor extension) that runs agents inside
sandboxed Docker containers, coordinates multi-agent delegation, and exposes a web UI + API.
Referenced for this project's own multi-agent orchestration (Phase 8's `create_agent` tool /
`OrchestratorAgent`) and, more loosely, for the general "agents run as a backend service, not
inside the editor" architecture this project shares with OpenHands and diverges from on Cline.

## 1. Architecture

A backend server process hosts the "AgentController" — the ReAct-style loop driving one agent —
and a separate **Runtime** component that actually executes actions (file edits, shell commands)
inside an isolated environment, most commonly a Docker container per session
(`opendevin/runtime`). This separation (control loop vs. execution sandbox) is OpenHands' single
biggest architectural idea: the LLM-driving loop never touches the host filesystem/shell directly,
only ever through the Runtime's own action/observation protocol, which can be swapped
(Docker-backed, local-process-backed, remote-backed) without the agent loop itself changing.

This project's own `BaseAgent`/tools (`apps/backend/app/agents/`) do *not* have this separation —
tools call `aiofiles`/`asyncio.create_subprocess_exec` directly against the real workspace
filesystem, validated per-call via `resolve_workspace_path()`'s path-traversal guard rather than
run inside a containerized sandbox. A real, deliberate scope difference: this project's agent
operates on the user's own already-open local workspace (the same files the user is editing in
Monaco), where a Docker-sandboxed execution environment would mean either syncing the workspace
into a container on every action (latency, complexity) or losing the "agent edits show up live in
the open editor" property this project's design otherwise gets for free. `AGENT_FRAMEWORK.md`'s
own guard rails (max file writes, max shell commands, workspace-path validation) are this
project's substitute safety boundary for not having container isolation.

## 2. Folder Structure

`openhands/controller/` (the agent loop + state machine), `openhands/runtime/` (the
sandboxed-execution abstraction, several backends), `openhands/agenthub/` (pluggable agent
"personalities" — CodeActAgent is the default/reference implementation), `openhands/server/`
(the FastAPI-based web server + WebSocket event stream to the frontend), `frontend/` (a separate
React app). The FastAPI + WebSocket-event-stream shape is close to this project's own
`app/api/v1/agents.py` + `app/api/ws/` — both stream step-by-step agent progress to a UI over a
persistent connection rather than polling, for the same reason (a long-running task needs live
updates, and polling a `GET` endpoint every second doesn't scale as well as a push channel).

## 3. Design Patterns

- **Action/Observation as the fundamental unit**, explicitly typed (`CmdRunAction`,
  `FileWriteAction`, `CmdOutputObservation`, ...) rather than a free-form string tool result. This
  project's tools return a plain `str` observation (`ToolRegistry.execute() -> str`) — simpler,
  less structured. OpenHands' typed observations let the agent loop reason about *what kind* of
  thing happened (e.g. distinguishing a command's exit code from its stdout) more precisely than
  this project's "everything is a string the model reads" approach. A real, intentionally simpler
  choice here — this project's tool set is smaller (13 originally, 18 of 19 now built) and each
  tool's own docstring/description carries enough context that a richer observation type hasn't
  been needed yet.
- **Multi-agent delegation via a "delegate" action** — the controlling agent can hand off a
  sub-task to a different agent type and resume once it reports back, structurally identical to
  this project's `create_agent` tool → `agent_factory.run_sub_agent()` (a Low-risk tool call that
  runs a whole sub-agent to completion and returns its result as the observation — see
  `agent_tools.py`/`agent_factory.py:147`). Independently convergent design: given "one agent
  needs to sometimes delegate to a specialist," a tool-call-shaped delegation mechanism is close
  to the natural answer in a ReAct-loop architecture either way.
- **Microagents** — small, condition-triggered prompt fragments injected into context when a
  keyword/repo pattern matches (e.g. a microagent that activates only for Python projects). This
  project has no equivalent — system prompts are fixed per agent type
  (`ResearcherAgent`/`CoderAgent`/etc.), not dynamically composed from smaller conditional pieces.
  A real, un-tracked idea worth considering if agent prompts grow complex enough to want
  composability.

## 4. Dependencies

Python (FastAPI backend, same language/framework choice this project made independently — not
copied, FastAPI is simply a strong default for an async Python API service), Docker (for the
Runtime sandbox — a hard dependency for OpenHands' default execution mode, whereas this project's
Docker integration, Phase 14, is a separate user-facing feature — a `DockerPanel` for managing the
user's *own* containers — unrelated to agent sandboxing), React frontend.

## 5. Build Process

Standard Python packaging (Poetry) for the backend, a separate Vite/React build for the frontend,
Docker images for both the server and the various supported runtime sandbox images (one per
supported base OS/toolchain). This project's own backend has no equivalent "which sandbox image"
concern since it doesn't sandbox agent execution in a container.

## 6. Features

Long-horizon multi-step task execution across an entire session (not bounded the way this
project's five hard guards bound a single task — `AGENT_FRAMEWORK.md` §11); a resolver mode that
can be pointed at a GitHub issue and produce a PR autonomously; a headless/CLI mode alongside the
web UI; cost tracking per session (token usage × provider pricing, surfaced to the user). This
project tracks `Message.token_count`/guard-enforced `MAX_TOKENS` per task but has no cost-in-
dollars display anywhere in the desktop UI — a real, named gap worth a `TASKS.md` follow-up if
cost visibility becomes a real user ask.

## 7. Strengths

- Container-sandboxed execution is a genuinely stronger security boundary than this project's
  path-validation-only approach — a compromised or badly-instructed agent in OpenHands can't
  escape its container the way a bug in this project's `resolve_workspace_path()` guard
  theoretically could escape to the host filesystem (mitigated here by that guard being real,
  tested, and the same one every file/shell tool routes through, but still a weaker boundary in
  principle than process/container isolation).
- The typed Action/Observation model (§3) makes the agent loop's own logging/debugging much more
  structured than a plain string-observation design.
- Delegation-as-a-first-class-concept (§3) scales cleanly to more agent types without special-
  casing the controller loop.

## 8. Weaknesses

- Docker-in-the-loop for every action adds real latency (container exec vs. direct in-process
  file I/O) — a cost this project's design avoids by not sandboxing, since its threat model
  (agent edits the same workspace the user has open, with a human approval gate on High-risk
  actions) is different from OpenHands' (agent may operate autonomously and unattended against
  arbitrary/untrusted repositories).
- Full runtime-abstraction flexibility (many pluggable sandbox backends) is real engineering
  surface area this project doesn't need for its narrower, single-local-workspace use case.

## 9. Reusable Modules

None imported (Apache 2.0 permits it — see `LICENSE_NOTES.md` — but Python-for-a-standalone-
service isn't structurally different enough from this project's own FastAPI backend to make direct
code reuse likely; the value here was architectural, not code-level). The delegation pattern (§3)
was already independently present in this project's `create_agent` tool before this analysis;
formalized the comparison, not the source of the idea.

## 10. Modules That Should Be Rewritten (if ever adopting container-sandboxed execution)

`openhands/runtime/`'s Docker-backed action executor would need substantial adaptation to this
project's existing tool interface (`RegisteredTool.func(context: AgentContext, ...) -> str`) —
worth real consideration only if this project's threat model changes (e.g. agents operating
against untrusted/unreviewed remote code, not the user's own open workspace).

## 11. License Requirements

See `LICENSE_NOTES.md`.
