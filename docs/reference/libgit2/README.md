# docs/reference/libgit2/

Analysis of libgit2 (native C binding) versus Git CLI subprocess for Git operations. Reference for the ADR 0008 decision.

## Files (written 2026-08-12)

| File | Contents |
|---|---|
| `ANALYSIS.md` | Full 11-dimension analysis of both approaches |
| `CLI_VS_NATIVE_NOTES.md` | Trade-off table: speed, reliability, cross-platform, maintenance |
| `LICENSE_NOTES.md` | libgit2's real license (GPLv2 + Linking Exception, not literally LGPL — see that file) and its implications for distribution |

## Key Trade-offs Documented

| Aspect | Git CLI | libgit2 |
|---|---|---|
| Setup complexity | Zero (git is pre-installed) | Requires native compilation |
| Feature parity | Complete (any git version) | Lags behind git |
| Parsing | Output parsing required | Structured API |
| Performance | Process spawn per call | In-process, faster |
| License | GPL (copyleft) | LGPL (link-safe) |

Decision: Git CLI subprocess chosen (see ADR 0008).
