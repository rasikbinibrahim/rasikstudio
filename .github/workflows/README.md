# .github/workflows/

GitHub Actions workflow definitions. Every workflow file here runs automatically on the specified trigger.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `test.yml` | Every PR, push to `main`, or called by `release.yml` | Lint, type-check, unit tests, integration tests — `pnpm lint`/`typecheck`/`test`/`build` at the repo root, the same commands a contributor runs locally |
| `security.yml` | Every PR, push to `main`, or called by `release.yml` | truffleHog secret scan, `pip-audit` (backend), `pnpm audit --audit-level=high` (desktop) |
| `release.yml` | Push a `v*` tag | Runs `test.yml` + `security.yml` first, then builds desktop installers for Windows/macOS/Linux and pushes the backend Docker image to GHCR |

**Not in this directory:** `dependabot.yml` lives at `.github/dependabot.yml` (repo root, not `workflows/`) — GitHub only reads Dependabot config from that exact path, unlike workflow files. An earlier version of this doc listed it here as if it were a workflow file, which would have meant it silently never took effect; fixed.

## How `release.yml` satisfies "create GitHub Release with artifacts"

There's no separate "create the release" step. `electron-builder.config.ts`'s `publish` block
already points at this repo's GitHub Releases; `release.yml` runs each platform's build with
`--publish always`, and electron-builder itself creates (or appends to, if another matrix job
already has) the release for the pushed tag and uploads that platform's installer as an asset.
Three OS jobs doing this in parallel is electron-builder's standard supported multi-platform CI
pattern, not a race condition to work around.

## Rules

- Every workflow must have a clear `name:` field.
- Secrets must reference `${{ secrets.* }}` — never hardcoded.
- All jobs in `release.yml` must depend on `test.yml` passing first — enforced by `release.yml`
  calling `test.yml` as a reusable workflow (`workflow_call`), not by convention.
- Do not skip the security scan on release builds — enforced the same way, via `security.yml`'s
  own `workflow_call` trigger.

## What's real and what isn't, as of Phase 15 (2026-08-06)

All three workflow files are written correctly against their documented triggers/secrets/job
dependencies and were verified indirectly (every command they run — `pnpm lint`/`typecheck`/
`test`/`build`, `docker build`, `uv run --with pip-audit pip-audit`, `pnpm audit`— was run for
real in this repository and passes). What has **not** been verified: an actual GitHub Actions run
of any of these three files. That needs a real push to the repository's remote and, for
`release.yml`'s signing steps, real secrets (a Windows code-signing certificate, an Apple
Developer account) that are account/cost decisions outside what a coding session can provision
unilaterally — same category as Phase 6's untested live OAuth round-trip and Phase 9's untested
live cloud-API calls. First real CI run is the next thing to check once this is pushed.
