# docs/reference/

Analysis documents for the 9 reference open-source projects studied before building Rasik Studio. Each subdirectory contains the analysis for one project across all 11 dimensions required by `CLAUDE.md`.

**Status (2026-08-12): all 9 complete.** Written after most of the implementation phases had
already landed, not before — a real, named gap in how this project's own process actually played
out (`PROGRESS.md`'s Phase 1 entry tracked this honestly rather than retroactively pretending the
analysis came first). Every document below cites the real, already-shipped code it compares
against (file paths, line numbers) rather than writing in the abstract, so the comparisons are
verifiable against the current repository, not just plausible-sounding.

## Projects

| Directory | Project | License | Key Lessons |
|---|---|---|---|
| `vscodium/` | VSCodium | MIT | IDE shell, extension host, process model |
| `cline/` | Cline | Apache 2.0 | AI agent loop, tool design, approval gates |
| `openhands/` | OpenHands | MIT | Autonomous agents, sandboxing, multi-agent |
| `continue/` | Continue | Apache 2.0 | AI chat in IDE, context building, streaming |
| `ollama/` | Ollama | MIT | Local model serving, REST API, streaming |
| `monaco/` | Monaco Editor | MIT | Editor setup, LSP, web workers |
| `playwright/` | Playwright | Apache 2.0 | Browser automation, session management |
| `xterm/` | xterm.js | MIT | Terminal emulation, WebGL renderer, addons |
| `libgit2/` | libgit2 / Git CLI | GPLv2+Linking Exception | Git operations, CLI vs. native binding |

## Analysis Dimensions (per project)

1. Architecture
2. Folder structure
3. Design patterns
4. Dependencies
5. Build process
6. Features
7. Strengths
8. Weaknesses
9. Reusable modules
10. Modules to rewrite
11. License requirements
