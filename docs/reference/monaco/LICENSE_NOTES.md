# Monaco Editor — License Notes

**License:** MIT.

## Obligations

Same as VSCodium's (see that folder's `LICENSE_NOTES.md`): preserve the copyright notice and
license text. No copyleft, no NOTICE-file requirement.

## What this project actually did

`monaco-editor` is a normal, unmodified `package.json` dependency (see `ANALYSIS.md` §4/§9) —
its license terms are satisfied the same way any other npm dependency's are: by depending on the
published package without modifying its source, with `pnpm`'s own lockfile recording the exact
version in use. No separate attribution file is needed for an unmodified dependency consumed this
way — this is the one reference project in `docs/reference/` that this codebase actually ships a
copy of (inside the built application bundle, as an ordinary bundled dependency), not merely
studies, which is worth being precise about here in a way the purely-studied references don't
need: `pnpm`'s lockfile + the published package's own bundled `LICENSE` file already satisfy MIT's
attribution requirement without any extra step from this project.

## If this project ever modified Monaco's own source

Would need to preserve its copyright header in the modified file and clearly note what changed —
not applicable today, since this project consumes the published package unmodified.
