# Phase 15 — Deployment Pipeline

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 3, Phase 4
**Estimated effort:** 2 weeks

---

## Objective

Configure the complete deployment pipeline: electron-builder for cross-platform desktop packaging, GitHub Actions CI/CD, auto-update mechanism, and backend Docker image. By the end of this phase, a `git push --tags v1.0.0` produces installable binaries on GitHub Releases.

## Architecture

**Desktop packaging (electron-builder):**
- Windows: NSIS installer (x64, arm64) + portable
- macOS: DMG (x64, arm64) + universal ZIP + notarization
- Linux: AppImage (x64, arm64) + deb + rpm

**Auto-update (electron-updater):**
- Check on launch and every 4 hours
- Show dialog when update available
- Download in background, prompt to restart when ready

**Backend Docker image (multi-stage Dockerfile):**
- Stage 1: install dependencies with `uv sync --frozen --no-dev`
- Stage 2: production image (no dev deps, minimal surface)
- Pushed to GHCR on release tags

**CI/CD workflows:**
- `test.yml` — runs on every PR: lint, type-check, unit tests, integration tests
- `security.yml` — runs on every PR: truffleHog, pip-audit, pnpm audit
- `release.yml` — runs on `v*` tags: test → build all platforms → push Docker image → create GitHub Release with artifacts

## Dependencies

- Phase 3 complete (desktop app builds successfully)
- Phase 4 complete (backend Docker-ready)
- GitHub repository with secrets configured
- Apple Developer account (for macOS notarization)
- Windows code signing certificate

## Files to Create

- `apps/desktop/electron-builder.config.ts` — finalize full config (started in Phase 2)
- `.github/workflows/release.yml`
- `.github/workflows/test.yml`
- `.github/workflows/security.yml`
- `apps/backend/Dockerfile` — finalize multi-stage image
- `build/entitlements.mac.plist` — macOS hardened runtime entitlements
- `build/icon.ico`, `build/icon.icns`, `build/icons/` — app icons

## Files to Modify

- `apps/desktop/package.json` — add build scripts for all platforms
- `apps/desktop/electron/services/auto-updater.ts` — finalize auto-updater config (from Phase 3 stub)

## Acceptance Criteria

- [ ] `pnpm build:win` produces a working NSIS installer on Windows
- [ ] `pnpm build:mac` produces a signed and notarized DMG on macOS
- [ ] `pnpm build:linux` produces a working AppImage on Linux
- [ ] The packaged app launches successfully and connects to the backend
- [ ] Auto-updater checks for updates on launch (verify in app log)
- [ ] `docker build apps/backend -t rasik-backend:test` succeeds
- [ ] `docker run rasik-backend:test` starts the backend
- [ ] Pushing a `v0.1.0` tag triggers the release CI workflow end-to-end
- [ ] GitHub Release contains all platform artifacts
- [ ] `truffleHog` CI scan passes (no secrets in repository)

## Testing Strategy

- **Manual:** Install the packaged app on each platform (or use CI matrix results)
- **CI verification:** The release workflow itself is the automated test

## Estimated Effort

**2 weeks**
- Week 1: electron-builder config, app icons, macOS notarization, GitHub Actions workflows
- Week 2: Docker multi-stage image, CI integration, release smoke test
