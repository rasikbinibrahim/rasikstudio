# Deployment Guide — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

Rasik Studio has two deployment targets:

1. **Desktop app** — packaged as a native installer for Windows, macOS, and Linux using electron-builder.
2. **Backend service** — containerized with Docker, deployable locally or to any cloud provider.

For most users, the backend runs locally alongside the desktop app. Cloud deployment is optional for teams sharing a backend.

---

## 2. Prerequisites

| Tool | Version | Required For |
|---|---|---|
| Node.js | 20 LTS | Desktop build |
| pnpm | 9+ | Desktop build |
| Python | 3.12+ | Backend |
| Docker | 24+ | Local backend |
| Docker Compose | 2.20+ | Local backend |
| Ollama | latest | Local AI |
| electron-builder | 24+ | Desktop packaging |

---

## 3. Local Development Setup

### 3.1 One-command setup

```bash
# Clone and install
git clone https://github.com/rasik-studio/rasik-studio.git
cd rasik-studio
pnpm install

# Copy environment template
cp apps/backend/.env.example apps/backend/.env
# Edit .env: set SECRET_KEY, ENCRYPTION_KEY

# Start backend services (PostgreSQL, Redis)
docker compose up -d db redis

# Run migrations
cd apps/backend && alembic upgrade head && cd ../..

# Start everything in development mode
pnpm dev   # starts backend + desktop simultaneously
```

### 3.2 pnpm dev script

Orchestrated with Turborepo, not `concurrently` (see `PROGRESS.md` Decisions Log) — `turbo run <task>` fans out to every workspace package that defines that script, backend included via its `package.json` shim over `uv`:

```json
// package.json (root)
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test"
  }
}
```

### 3.3 Backend development server

```bash
cd apps/backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 3.4 Desktop development

```bash
cd apps/desktop
pnpm dev   # starts electron-vite with HMR
```

---

## 4. Environment Variables

```bash
# apps/backend/.env

# Required
APP_ENV=development
SECRET_KEY=change-me-to-a-32-char-random-string
ENCRYPTION_KEY=change-me-to-a-32-char-random-string

# Database
DATABASE_URL=postgresql+asyncpg://rasik:rasik@localhost:5432/rasik_studio

# Redis
REDIS_URL=redis://localhost:6379/0

# Ollama (local AI)
OLLAMA_BASE_URL=http://localhost:11434

# Optional: Cloud AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
AI_RESPONSE_CACHE_TTL_SECONDS=3600
FALLBACK_CHAINS_PATH=config/fallback_chains.yaml

# OAuth (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Auth
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
```

---

## 5. Docker Compose (Local)

The real file is the root `docker-compose.yml` — this section used to embed a hand-drafted sketch
that never matched it (a `backend` service was missing entirely, and the worker command named a
module, `app.worker`, that was never built). Now that ADR 0004's Celery infrastructure is real
(`app/core/celery_app.py`, `app/tasks/agent_tasks.py`), pointing at the real file is more
trustworthy than re-embedding a copy that can drift again — see `docker-compose.yml` directly for
the current `db`/`redis`/`backend`/`worker` services. Two things worth calling out that aren't
obvious from skimming the file:

- `worker` uses `--pool=threads`, not Celery's default prefork — `app/core/celery_app.py`'s own
  docstring explains why (prefork forks after the async DB engine is already imported, corrupting
  inherited pooled connections; threads avoid the fork entirely).
- `worker`'s `healthcheck` overrides the image's own `HEALTHCHECK` (a `/health/live` HTTP request,
  meaningless in a container with no HTTP server) with `celery inspect ping` instead.

---

## 6. Desktop App Build

### 6.1 Build all platforms (on macOS with cross-compilation)

```bash
cd apps/desktop
pnpm build:all   # builds Windows + macOS + Linux
```

### 6.2 Build for specific platform

```bash
pnpm build:win    # Windows (NSIS installer + portable)
pnpm build:mac    # macOS (DMG + zip)
pnpm build:linux  # Linux (AppImage + deb + rpm)
```

### 6.3 electron-builder configuration

Real, current file: `apps/desktop/electron-builder.config.ts`. Two corrections against earlier
drafts of this section, both fixed in the real file:

- `files: ['out/**/*']`, not `['dist/**/*', 'electron/dist/**/*']` — `electron-vite build`'s real
  output directory is `out/` (`out/main`, `out/preload`, `out/renderer`), confirmed by a real
  `pnpm build` run; the old paths never matched anything.
- `mac.notarize` is a plain `boolean` in electron-builder v24+ (`Boolean(process.env['APPLE_ID'])`
  in the real file), not the `{ appleId, appleIdPassword, teamId }` options object shown in
  earlier electron-builder versions' docs — modern electron-builder reads
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` from the environment itself once
  notarization is toggled on; passing an object there fails `tsc --noEmit`.

```typescript
// apps/desktop/electron-builder.config.ts — abbreviated, see the real file for the complete
// version including its own comments explaining each of these choices

const config: Configuration = {
  appId: 'dev.rasikstudio.ide',
  productName: 'Rasik Studio',
  directories: { buildResources: 'build', output: 'dist-electron' },
  files: ['out/**/*'],
  asar: true,
  asarUnpack: ['**/node_modules/node-pty/**'],

  win: {
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }, { target: 'portable', arch: ['x64'] }],
    icon: 'build/icon.ico',
    certificateSubjectName: process.env['WIN_CERT_SUBJECT'],
  },

  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }, { target: 'zip', arch: ['universal'] }],
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: Boolean(process.env['APPLE_ID']),
  },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }, { target: 'deb', arch: ['x64'] }, { target: 'rpm', arch: ['x64'] }],
    icon: 'build/icons',
  },

  publish: { provider: 'github', owner: 'rasik-studio', repo: 'rasik-studio' },
};
```

**Verified, 2026-08-06:** `pnpm exec electron-builder --dir --linux` was actually run against this
config (Electron 39.8.10) — `@electron/rebuild` automatically recompiled `node-pty` against
Electron's Node ABI (confirmed in the build log, resolving what would otherwise be a real native-
module-version-mismatch risk on every Electron upgrade), `node-pty` landed under
`resources/app.asar.unpacked/` as `asarUnpack` requires, and the resulting binary was launched
directly and ran without crashing (see §7's own verification note) — real packaging + real
native-module compatibility, not just a config file that's never been exercised.

---

## 7. Auto-Update

Rasik Studio uses `electron-updater` for automatic updates — `apps/desktop/electron/main/auto-updater.ts` is the real, current implementation (Phase 15, 2026-08-06):

```typescript
// apps/desktop/electron/main/auto-updater.ts (excerpt — see the real file for the full version)
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // check on launch and every 4 hours

autoUpdater.autoDownload = true
autoUpdater.on('update-available', (info) => { /* logged, downloads in the background */ })
autoUpdater.on('update-downloaded', () => promptRestart()) // "Restart Now" / "Later" dialog
autoUpdater.on('error', (err) => { /* logged, never crashes the app */ })

void autoUpdater.checkForUpdates()
setInterval(() => void autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS)
```

Updates are published to GitHub Releases (via `release.yml`'s `electron-builder ... --publish always`, matching `electron-builder.config.ts`'s `publish` block). The desktop app checks for updates on launch and every 4 hours, exactly as this section originally specified — implemented as a manual `checkForUpdates()` + `setInterval` (not `checkForUpdatesAndNotify()`) so the "available" and "downloaded" events can be handled with this app's own dialog copy instead of Electron's generic default notification. A no-op in development (`app.isPackaged === false`) — there's no packaged build to update, and `electron-updater` itself throws if asked to check outside one.

**Verified, 2026-08-06:** a real `electron-builder --dir --linux` package (Electron 39.8.10) was built and launched directly (`--no-sandbox`, working around this sandboxed dev environment's missing GTK/NSS shared libraries the same way Phase 13 worked around missing Chromium libraries) — the auto-updater module loaded and ran for real inside a genuinely packaged app (confirmed via its own "not an AppImage" log line, which only prints from inside `electron-updater`'s real provider-detection code), not just unit-tested against a mock. It could not complete an actual update check (no GitHub release exists yet for this unreleased project), which is the expected, correct behavior — same category as every other "real code, no live external target yet" verification already documented elsewhere in this file (§8's own CI-run caveat below).

---

## 8. CI/CD Pipeline

Real files: `.github/workflows/test.yml`, `security.yml`, `release.yml`, and `.github/dependabot.yml` (dependency-update config lives at the `.github/` root, not inside `workflows/` — see `.github/workflows/README.md`'s own correction of this file's previous placement). `release.yml`'s shape:

```yaml
# .github/workflows/release.yml — see the real file for the complete, current version

on:
  push:
    tags: ['v*']

jobs:
  test:
    uses: ./.github/workflows/test.yml       # workflow_call — must pass first
  security:
    uses: ./.github/workflows/security.yml   # workflow_call — must pass first, not skippable

  build-desktop:
    needs: [test, security]
    strategy:
      matrix:
        include:
          - { os: windows-latest, flag: --win }
          - { os: macos-latest, flag: --mac }
          - { os: ubuntu-latest, flag: --linux }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - working-directory: apps/desktop
        run: pnpm exec electron-vite build
      - working-directory: apps/desktop
        run: pnpm exec electron-builder ${{ matrix.flag }} --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # ... WIN_CERT_SUBJECT / CSC_LINK / CSC_KEY_PASSWORD / APPLE_ID / etc. — see the real file

  build-and-push-docker:
    needs: [test, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: apps/backend
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/rasik-backend:${{ github.ref_name }}
```

There is no separate "create the GitHub Release" job — `electron-builder ... --publish always` creates/updates the release for the pushed tag itself, using `electron-builder.config.ts`'s existing `publish` block. **Not verified by a real CI run** (needs a real push to the repository's remote, which this session doesn't do unilaterally, plus real signing secrets for the Windows/macOS steps to do more than build unsigned) — every command inside these workflows (`pnpm lint`/`typecheck`/`test`/`build`, `docker build`, `pip-audit`, `pnpm audit`) was run for real in this repository and passes; see `.github/workflows/README.md`'s own "What's real and what isn't" section for the full breakdown.

---

## 9. Backend Docker Image

**Phase 13 (Browser):** the real `apps/backend/Dockerfile` runs `playwright install --with-deps chromium` in the `production` stage — `PlaywrightBrowserService` needs a real Chromium binary plus its shared-library dependencies to power the agent's headless-browser tools. This adds real, non-trivial build time (Chromium + its deps are several hundred MB) and final image size; verified with a real `docker build` + a real in-container Playwright navigation/screenshot, not just written and assumed to work.

**Phase 15 (Deployment):** the multi-stage build was finalized — `uv sync --frozen --no-dev` (fails the build on a `uv.lock`/`pyproject.toml` drift instead of silently re-resolving), `alembic/`+`alembic.ini` now ship in the image (so `docker run rasik-backend:test alembic upgrade head` is possible against a deployed image, not just from a dev checkout), a non-root `rasik` user runs the actual server process (created after `uv sync`/`playwright install --with-deps`, which both need root), and a `HEALTHCHECK` against `/health/live` gives Docker/Compose/an orchestrator a real liveness signal instead of only "the process is still running." `PLAYWRIGHT_BROWSERS_PATH=/app/.playwright` keeps the Chromium install under `/app` specifically so the later `chown -R rasik:rasik /app` covers it too — Playwright's own default (`$HOME/.cache/ms-playwright`) would otherwise land under `/root` and become unreadable once `HOME` changes for the non-root user. Verified end to end with a real `docker build` + `docker run`: `whoami` inside the running container is `rasik`, `GET /health/live` returns `200 {"status":"ok"}`, and `docker inspect`'s health status reaches `healthy`. This project deliberately kept plain `uvicorn` (single process) rather than adopting `gunicorn` + `UvicornWorker` — no doc or roadmap phase actually requires multi-worker serving, and introducing it would mean a new dependency and a behavior change (worker-count tuning, SIGTERM handling across workers) with no acceptance criterion asking for it; revisit if real production load ever needs it.

```dockerfile
# apps/backend/Dockerfile

FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS deps
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM base AS production
COPY --from=deps /app/.venv /app/.venv
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

ENV PATH="/app/.venv/bin:$PATH"
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN playwright install --with-deps chromium

RUN useradd --create-home --uid 1000 rasik \
    && chown -R rasik:rasik /app /home/rasik
USER rasik
ENV HOME=/home/rasik

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=3)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

See `apps/backend/Dockerfile` itself for the current, authoritative version — this snippet is kept in sync with it, not the other way around.

---

## 10. Production Deployment (Self-Hosted)

For teams running a shared backend:

```yaml
# docker-compose.prod.yml

services:
  backend:
    image: ghcr.io/rasik-studio/backend:latest
    env_file: .env.prod
    depends_on: [db, redis]
    labels:
      - "traefik.http.routers.backend.rule=Host(`api.rasikstudio.yourdomain.com`)"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"

  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    ports:
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./acme.json:/acme.json

  db:
    image: pgvector/pgvector:pg16
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
```

---

## 11. Health Check and Monitoring

After deployment, verify:
```bash
curl https://api.rasikstudio.yourdomain.com/health/ready
# Expected: {"status": "ok", "database": "connected", "redis": "connected"}
```

Prometheus metrics exposed at `/metrics` (protect with auth in production).

Key metrics to monitor:
- `http_request_duration_seconds` — API latency
- `agent_task_duration_seconds` — Agent task duration
- `model_request_duration_seconds` — AI model response time
- `db_pool_size` — PostgreSQL connection pool
