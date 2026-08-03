# .github/workflows/

GitHub Actions workflow definitions. Every workflow file here runs automatically on the specified trigger.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `test.yml` | Every PR | Lint, type-check, unit tests, integration tests |
| `security.yml` | Every PR | truffleHog secret scan, pip-audit, pnpm audit |
| `release.yml` | Push `v*` tag | Build all platforms, push Docker image, create GitHub Release |
| `dependabot.yml` | Weekly schedule | Automated dependency update PRs |

## Rules

- Every workflow must have a clear `name:` field.
- Secrets must reference `${{ secrets.* }}` — never hardcoded.
- All jobs in `release.yml` must depend on `test.yml` passing first.
- Do not skip the security scan on release builds.
