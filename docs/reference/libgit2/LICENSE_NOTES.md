# libgit2 — License Notes

**License:** GPLv2, with a Linking Exception — **not** literally LGPL, though the practical effect
for most consumers is similar (this folder's own `README.md` says "libgit2 is LGPL," a common
simplification; corrected here for precision since a real licensing decision should be based on
the actual terms, not the informal shorthand).

## What "GPLv2 + Linking Exception" actually means

libgit2's `COPYING` file states the library is licensed under GPLv2, **plus** an explicit linking
exception: a program that merely *links* against libgit2 (statically or dynamically) is not
thereby required to be GPL-licensed itself, and does not need to disclose its own source — the
copyleft obligation applies to modifications of libgit2's *own* source, not to code that simply
uses it as a library. This is functionally close to LGPL's own "link-safe" property (why the
informal "libgit2 is LGPL" shorthand exists), but is a distinct, custom exception clause rather
than the actual LGPL license text — a real distinction that matters if this project (or any
consumer) ever needs to cite the precise legal terms rather than the practical summary.

## Why this was still a real, considered factor (even though it wasn't the deciding one)

ADR 0008's Rationale doesn't cite licensing as a blocking concern — the linking exception means
libgit2 could have been adopted without forcing this project's own `LICENSE` (Apache 2.0) to
change or requiring source disclosure of this project's own code. The decision not to adopt it was
driven entirely by the packaging/maintenance factors in `CLI_VS_NATIVE_NOTES.md` (native-module
burden, `nodegit`'s maintenance lag risk), not by licensing — worth stating explicitly so this
document doesn't imply licensing was ever a blocker it wasn't.

## What this project actually did

libgit2 was never linked, vendored, or bound into this project in any form — `GitService` shells
out to the real `git` binary as a subprocess (ADR 0008), which has no relationship to libgit2's
license at all (the `git` binary itself is GPLv2, but invoking an installed binary as a subprocess
— not linking against it, not distributing it — creates no license obligation on this project's
own code, the same principle that lets any application shell out to any GPL-licensed CLI tool
without becoming GPL itself).

## If this project ever adopted libgit2 (e.g. via `nodegit`) in the future

The Linking Exception means this would **not** require relicensing this project's own code or
disclosing its source — only libgit2's own source (if modified) would carry forward its GPLv2
obligations. Would still need libgit2's copyright/license notice included in distribution
materials per its own terms (a `THIRD_PARTY_NOTICES.md` entry, not yet needed since nothing was
adopted).
