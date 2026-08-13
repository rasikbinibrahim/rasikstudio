# OpenHands — Sandbox Notes

How OpenHands isolates agent execution from the host system, and why this project deliberately
doesn't do the same thing.

## OpenHands' model

Every action an agent takes (run a command, write a file) is dispatched to a **Runtime** —
typically a per-session Docker container, though local-process and remote-server backends also
exist — over an internal action/observation protocol (see `ANALYSIS.md` §3). The controlling
agent loop (the LLM-driving code) never has direct filesystem or subprocess access; it only ever
sees the Runtime's responses. This means:

- A destructive command (`rm -rf /`) run by the agent only destroys the *container's* filesystem,
  not the host's.
- The container can be given a curated toolchain (specific language/runtime versions) independent
  of whatever's installed on the host machine running the OpenHands server.
- Network egress from the container can be restricted independently of the host's own network
  access.

## Why this project doesn't sandbox agent execution the same way

This project's agent operates on the **same local workspace the user has open in the editor** —
that's the whole point (the agent's file edits are the same files Monaco has open, git status
updates live, etc.). Sandboxing that in a container would mean either:

1. Syncing the workspace into a container before every agent task and syncing changes back out —
   real latency and complexity, and a real risk of the container's view of the workspace going
   stale mid-task if the user edits a file concurrently.
2. Bind-mounting the real workspace directory into the container — which provides *no* additional
   filesystem isolation over what this project already has (the container could still write
   anywhere inside the mounted workspace), while adding Docker as a hard runtime dependency for a
   feature (agent tasks) that currently has none.

Given that, this project's actual isolation boundary is different, not weaker by omission:

- **`resolve_workspace_path()`** (used by every file tool) rejects any path that resolves outside
  the workspace root — the same class of guard a container's mount boundary would provide, at the
  application layer instead of the OS/kernel layer.
- **`shlex.split()` + `asyncio.create_subprocess_exec()`** (never `shell=True`) for `run_command`
  — prevents shell-metacharacter injection, independent of container isolation.
- **The five hard guards** (`AGENT_FRAMEWORK.md` §11: max iterations, max file writes, max shell
  commands, max tokens, task timeout) bound the *blast radius* of a misbehaving or malicious-
  prompt-injected task even without a container boundary — a runaway agent can do at most 50 file
  writes and 20 shell commands before the guard trips, not an unbounded amount.
- **The human approval gate** on every High-risk tool call is this project's actual "don't let the
  agent do something destructive without a human in the loop" answer — OpenHands has an
  equivalent confirmation mode, but its container sandbox means an *unapproved* destructive action
  is still contained to the sandbox; this project's answer is instead to gate the action itself
  before it happens.

## When container sandboxing would become worth adopting here

If this project's threat model changes — e.g. an agent ever operates against a workspace the user
hasn't already vetted (a freshly cloned untrusted repo, before any human review), or against
multiple users' workspaces from one shared backend process — container-level isolation would be
the right next step, and OpenHands' Runtime abstraction is the right reference architecture to
revisit at that point. Not needed for this project's current single-user-editing-their-own-
already-open-workspace scope.
