# Git CLI vs. libgit2 (native) — Trade-off Notes

Expands this folder's own `README.md` trade-off table with the reasoning behind each row, and
records what this project's real, shipped `GitService` implementation confirms in practice.

| Aspect | Git CLI (chosen) | libgit2 (native) |
|---|---|---|
| Setup complexity | Zero — `git` is already required for this app's other features (agent tools, AI commit messages) | Requires native compilation per platform/Electron-ABI, or a prebuilt-binary distribution strategy |
| Feature parity | Complete, automatically — it *is* the reference implementation | Reimplements Git's algorithms; can lag behind edge cases/newer features |
| Parsing | Real work, but bounded to Git's own documented stable formats (`--porcelain=v2`) | No parsing — a real typed object-model API |
| Performance (per call) | Process spawn overhead per invocation | In-process, no spawn cost |
| Packaging | No native module | A second native dependency alongside `node-pty` (ADR 0001) |
| License | GPL (the `git` binary itself — irrelevant here, see below) | GPLv2 + Linking Exception (see `LICENSE_NOTES.md`) |

## Why the "Performance" row didn't decide this

Process-spawn overhead is real but was judged irrelevant at this project's actual usage pattern:
the Git panel refreshes on **explicit user action** (opening the panel, after a commit, after
staging a file) — never on a timer or high-frequency poll. ADR 0008's own Consequences section
names this precisely: "acceptable for interactive use... would need reconsideration if this were
ever used for high-frequency polling (it isn't)." If a future feature *did* need high-frequency
git access (e.g. live-updating blame annotations as the user scrolls), this row would be worth
revisiting — not a permanent verdict, a decision scoped to this project's actual current usage.

## Why "Setup complexity" and "Packaging" together were decisive

This project already accepted one native-module packaging burden (`node-pty`, ADR 0001, needed
because there is no CLI-subprocess equivalent for a real interactive PTY) and already had a real,
independent reason to want to minimize any *second* one: Phase 15's Electron 32→39 upgrade
(driven by 3 real unpatched CVEs, one a context-isolation bypass) required `@electron/rebuild` to
successfully recompile `node-pty` against the new ABI — verified for real, and it worked, but it's
exactly the class of risk a second native dependency (`nodegit`) would double. Choosing the CLI
subprocess approach for git specifically avoided taking on that risk a second time for a feature
(git integration) that doesn't actually need in-process performance.

## What this project's real implementation confirms about the "Parsing" row

The CLI approach's real cost — parsing — was bounded successfully in practice, not just in theory:
`git-status-parser.ts` targets `git status --porcelain=v2 --branch --find-renames` exclusively
(Git's own documented-stable machine-readable format, not the default human-readable output),
and every field offset was verified against real captured output including a real merge conflict
and a real ahead/behind-tracking remote (`PROGRESS.md`'s Phase 12 entry) — not derived from the
man page alone. One real edge case this approach surfaced, caught by the test suite: `git restore
--staged` fails with `fatal: could not resolve HEAD` in a repository with zero commits (a normal
"`git init`, stage a file, change your mind" sequence) — `GitService.unstage()` catches this
specific failure and falls back to `git rm --cached`. A libgit2-based implementation would face an
analogous edge case (Git's own object model also can't resolve a nonexistent HEAD), so this isn't
a cost unique to the CLI approach — worth naming as a general Git-semantics edge case either
implementation strategy has to handle, not a mark against the chosen one.

## Bottom line

Confirmed correct through real, tested implementation (`PROGRESS.md`'s Phase 12 entry, ADR 0008's
own Outcome section) — see ADR 0008 for the full accepted-decision writeup this document
complements rather than duplicates.
