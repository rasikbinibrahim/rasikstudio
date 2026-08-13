# libgit2 vs. Git CLI — Reference Analysis

**Studied as of:** 2026-08-12. libgit2 is a portable, dependency-free C implementation of Git's
core algorithms, distributed as a linkable library with bindings in most languages (Node's
`nodegit`, Python's `pygit2`, .NET's `LibGit2Sharp`, ...). This project chose the real `git` CLI
as a subprocess instead — see ADR 0008 for the accepted decision and its full rationale; this
document studies libgit2 itself (both approaches, per this folder's own scope) rather than
re-deriving that decision.

## 1. Architecture

A C library exposing a large, low-level object-model API (`git_repository`, `git_commit`,
`git_tree`, `git_index`, `git_reference`, ...) mirroring Git's own internal object model directly
— a consumer walks/manipulates these objects programmatically rather than parsing text output the
way a CLI-subprocess approach does. No process boundary: bindings link the library in-process
(via native addon compilation for interpreted languages), so every call is a real function call,
not a spawned subprocess.

## 2. Folder Structure

Not directly relevant to this project (never vendored or linked) — a C library's own source
organization (by Git object type: `src/commit.c`, `src/tree.c`, ...) has no counterpart in this
project's own `GitService` design, which is organized by *operation* (`status`/`stage`/`commit`/
...) rather than by Git object type, since it never touches Git's object model directly at all —
every operation is "build the right `git` argv, run it, parse its output."

## 3. Design Patterns (of the CLI-subprocess approach this project actually chose)

- **`execFile`, never `exec`/a shell string** (`electron/main/git-service.ts`) — every git
  invocation passes a real argv array, eliminating shell-interpolation injection risk even with
  untrusted-looking file paths as arguments. The same rule this project's backend `run_command`
  agent tool follows (`shlex.split()` + `create_subprocess_exec`) — one convention, applied
  consistently across both the desktop Electron layer and the backend Python layer.
- **Parse only stable, documented machine-readable output**, never human-readable text that could
  change between git versions — `git-status-parser.ts` targets `git status --porcelain=v2
  --branch --find-renames` specifically because Git documents `--porcelain=v2`'s format as stable
  API surface, not an incidental side effect of how `git status`'s default human output happens to
  look today.
- **Every field offset verified against real captured output**, not written from the man page
  alone (`PROGRESS.md`'s Phase 12 entry) — including a real merge conflict and a real ahead/
  behind-tracking remote, the two trickiest cases `--porcelain=v2`'s format has to represent.

## 4. Dependencies

libgit2 itself has none beyond a C toolchain to build it and, for language bindings, whatever
native-addon compilation infrastructure that language needs (`node-gyp`-equivalent for Node,
Cython for Python's `pygit2`, ...). This project's actual choice needs only the `git` binary on
the user's `PATH` — already true for essentially every development machine this app targets,
since a developer without git installed couldn't meaningfully use most of this app's other
features either (agent tools' `get_git_status`/`git_diff`, the AI commit-message generator, ...).

## 5. Build Process

libgit2-via-`nodegit` requires either a native compilation step at `npm install` time or a
prebuilt binary matching the exact Node/Electron ABI — the same class of packaging burden ADR 0001
already accepts once for `node-pty` (this project's one unavoidable native dependency, needed for
real PTY support with no CLI-subprocess equivalent). This project's `GitService` needs zero
additional build steps — `execFile('git', ...)` requires nothing beyond git already being on
`PATH` at runtime.

## 6. Features

libgit2 exposes essentially all of Git's object-level capabilities (some git-the-CLI's own
porcelain commands compose from several of), plus some things meaningfully *harder* to get right
via CLI-parsing (e.g. walking blame history efficiently). What this project actually needs
(`status`/`stage`/`unstage`/`commit`/`diff`/`showFile`/`log`/`branches`/`checkout`/`push`/`pull`)
is fully covered by real `git` CLI subcommands with stable, parseable output — no feature gap
motivated the CLI choice; ADR 0008's Alternatives Considered section already names this.

## 7. Strengths (of libgit2 as a library)

- No subprocess-spawn overhead per call — real, measurable for high-frequency programmatic git
  access (e.g. a tool that inspects thousands of commits' metadata in a loop).
- A real, typed object-model API rather than text parsing — no risk of a parsing bug on an edge
  case the human-facing CLI output changed between versions (mitigated for this project by
  targeting `--porcelain=v2` specifically, which is exactly the machine-readable-and-stable
  contract libgit2's own API would otherwise be needed for).

## 8. Weaknesses (of libgit2 as a library, relative to this project's actual needs)

- Native-module packaging burden (§5) — a second native dependency alongside `node-pty`, doubling
  the platform/Electron-ABI compilation surface this project would need to maintain.
- `nodegit` specifically has a real history of lagging behind current Node/Electron versions
  (named in ADR 0008's Alternatives Considered) — a genuine risk for a project that has already
  needed to move fast on Electron version bumps for security reasons (the 32→39 upgrade, Phase 15,
  driven by real unpatched CVEs).
- Feature/edge-case parity with the real `git` binary isn't automatic — libgit2 reimplements Git's
  algorithms rather than wrapping the reference implementation, so any divergence (a newer git
  feature, a subtle edge case) needs libgit2's own maintainers to catch up.

## 9. Reusable Modules

None — libgit2 was never linked or vendored. `git-status-parser.ts`'s own porcelain-v2 parsing
logic is this project's own original code, informed by studying Git's documented output format,
not derived from libgit2's source.

## 10. Modules That Should Be Rewritten

Not applicable — libgit2 was never adopted.

## 11. License Requirements

See `LICENSE_NOTES.md` — libgit2's actual license terms are more nuanced than a simple "LGPL"
label, worth getting precisely right given this decision's own Alternatives Considered section
references it.
