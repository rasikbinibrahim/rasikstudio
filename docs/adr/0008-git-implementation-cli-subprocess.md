# ADR 0008: Git Implementation — CLI Subprocess, Not `libgit2`

## Status

Accepted (2026-08-03)

## Context

Git integration (status, stage/unstage, commit, diff, log, branches, checkout, push, pull) needs
to run from the Electron main process. The two realistic approaches are shelling out to the real
`git` binary as a subprocess, or binding to `libgit2` (via a native Node addon like `nodegit`).

## Decision

Use `git` CLI subprocesses (`execFile('git', [...])`, never a shell string) exclusively — no
`libgit2` binding.

## Rationale

- **Full feature parity for free.** The real `git` binary supports every git feature/edge case
  (merge conflicts, rename detection, every ref format) without this project needing to track
  `libgit2`'s own feature coverage or bug-for-bug compatibility with real git.
- **No native module to compile per platform.** `nodegit`-style bindings need prebuilt binaries
  (or a build toolchain) per OS/arch/Electron-ABI combination — the exact maintenance burden ADR
  0001 already accepts for `node-pty` alone; not worth doubling for git too.
- **`execFile`, never `exec`/a shell string** — every argument is passed as a real argv array, so
  there is no shell-interpolation injection surface even with untrusted-looking file paths as
  arguments (matches the same rule the backend's `run_command` agent tool already follows).

## Alternatives Considered

- **`libgit2` via `nodegit`** — potentially faster for high-frequency status polling (no process
  spawn per call), but `nodegit`'s own maintenance has historically lagged behind current Node/
  Electron versions, and it reintroduces the native-module-per-platform problem this decision
  avoids.
- **`isomorphic-git`** (pure JS) — no native module at all, but reimplements git's object model
  in JavaScript, with real performance and feature-completeness gaps against a large real
  repository (this app's own repo, for instance).

## Consequences

- Every git operation pays real subprocess-spawn overhead — acceptable for interactive use (a
  user staging/committing files), would need reconsideration if this were ever used for
  high-frequency polling (it isn't — the Git panel refreshes on explicit user action, not a
  timer).
- Output parsing must target git's *stable, documented* machine-readable formats
  (`--porcelain=v2`), never human-readable output that could change between git versions.

## Outcome

Confirmed correct through Phase 16. `GitService` (`status`/`stage`/`unstage`/`commit`/`diff`/
`showFile`/`log`/`branches`/`checkout`/`push`/`pull`) has been real and tested since Phase 12,
including 12 tests against a **real, throwaway git repository** (not mocked). `git-status-
parser.ts`'s `--porcelain=v2 --branch --find-renames` parsing was verified against real captured
output, including an actual merge conflict and a real ahead/behind-tracking remote — not written
from the man page alone. One real edge case this decision's subprocess approach surfaced that a
library binding might have handled differently: `git restore --staged` fails with `fatal: could
not resolve HEAD` in a zero-commit repository, caught by the test suite and handled with a
`git rm --cached` fallback.
