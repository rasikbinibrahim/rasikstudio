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

```json
// package.json (root)
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter backend dev\" \"pnpm --filter desktop dev\"",
    "build": "pnpm --filter backend build && pnpm --filter desktop build",
    "test": "pnpm --filter backend test && pnpm --filter desktop test"
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

```yaml
# docker-compose.yml

services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: rasik
      POSTGRES_PASSWORD: rasik
      POSTGRES_DB: rasik_studio
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rasik"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  celery:
    build: apps/backend
    command: celery -A app.worker worker --loglevel=info --concurrency=4
    env_file: apps/backend/.env
    depends_on: [db, redis]

volumes:
  postgres_data:
  redis_data:
```

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

```typescript
// apps/desktop/electron-builder.config.ts

const config: Configuration = {
  appId: 'dev.rasikstudio.ide',
  productName: 'Rasik Studio',
  copyright: 'Copyright © 2026 Rasik Studio',
  
  directories: {
    buildResources: 'build',
    output: 'dist-electron',
  },

  files: [
    'dist/**/*',
    'electron/dist/**/*',
  ],

  asar: true,
  asarUnpack: ['**/node_modules/node-pty/**'],   // native module

  win: {
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'build/icon.ico',
    certificateSubjectName: process.env.WIN_CERT_SUBJECT,
  },

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['universal'] },
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: process.env.APPLE_ID ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    } : false,
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
    ],
    icon: 'build/icons',
    category: 'Development',
  },

  publish: {
    provider: 'github',
    owner: 'rasik-studio',
    repo: 'rasik-studio',
  },
};
```

---

## 7. Auto-Update

Rasik Studio uses `electron-updater` for automatic updates:

```typescript
// electron/main.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.logger = log;
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({ message: `Update ${info.version} available. Downloading...` });
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    message: `Update ${info.version} ready. Restart to install?`,
    buttons: ['Restart', 'Later'],
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});
```

Updates are published to GitHub Releases. The desktop app checks for updates on launch and every 4 hours.

---

## 8. CI/CD Pipeline

```yaml
# .github/workflows/release.yml

on:
  push:
    tags: ['v*']

jobs:
  test:
    uses: ./.github/workflows/test.yml

  build-desktop:
    needs: test
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: pnpm install
      - run: pnpm build:electron
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          WIN_CERT_SUBJECT: ${{ secrets.WIN_CERT_SUBJECT }}

  build-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ghcr.io/rasik-studio/backend:${{ github.ref_name }} apps/backend
      - run: docker push ghcr.io/rasik-studio/backend:${{ github.ref_name }}
        env:
          REGISTRY_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 9. Backend Docker Image

```dockerfile
# apps/backend/Dockerfile

FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

FROM base AS production
COPY --from=deps /app/.venv /app/.venv
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
CMD ["gunicorn", "app.main:app", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--timeout", "120"]
```

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
