FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS deps
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
# --frozen: fail the build rather than silently re-resolve if uv.lock and pyproject.toml have
# drifted — a production image should be built from exactly what CI/tests already verified,
# never from a resolution that happens to differ at build time (Phase 15's own reproducibility
# requirement; Phase 4/13's earlier `uv sync --no-dev` predated this concern).
RUN uv sync --frozen --no-dev

FROM base AS production
COPY --from=deps /app/.venv /app/.venv
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

ENV PATH="/app/.venv/bin:$PATH"
# Installed before the `USER` switch below (still root, for `--with-deps`'s `apt-get`) but pointed
# at a path under /app so the later `chown -R rasik:rasik /app` picks it up too — Playwright's
# default cache is `$HOME/.cache/ms-playwright`, which would otherwise land under /root and become
# unreadable to `rasik` once `HOME` changes.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

# Phase 13 (Browser): PlaywrightBrowserService needs a real Chromium binary plus its shared-library
# dependencies (libnspr4/libnss3/libasound2/etc.) — `--with-deps` installs both via apt, which is
# why this has to run as root, at build time, in the image itself. `playwright install chromium`
# alone (no `--with-deps`) downloads the browser but not its system libraries, which is a real,
# separate failure mode (`error while loading shared libraries: libnspr4.so: ...`) worth avoiding
# explicitly rather than discovering it the first time an agent task calls `browser_navigate`.
RUN playwright install --with-deps chromium

# Drop root only after both `uv sync` and `playwright install --with-deps` (which needs `apt-get`,
# root-only) have already run — the actual server process has no reason to run as root, and
# Chromium's own sandbox additionally refuses to run as root without `--no-sandbox`, which
# `playwright_service.py` does not pass.
RUN useradd --create-home --uid 1000 rasik \
    && chown -R rasik:rasik /app /home/rasik
USER rasik
ENV HOME=/home/rasik

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=3)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
