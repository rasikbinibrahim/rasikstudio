from __future__ import annotations

import asyncio
import contextlib
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

import structlog

from app.infrastructure.lsp.client import LspClient, LspClientError, path_to_uri

logger = structlog.get_logger("lsp.manager")

DEFAULT_IDLE_TIMEOUT_SECONDS = 15 * 60
DEFAULT_IDLE_CHECK_INTERVAL_SECONDS = 60
DEFAULT_DIAGNOSTICS_TIMEOUT_SECONDS = 10.0

# Python only, for now — the desktop's own `lsp-manager.ts` also resolves TypeScript/JSON servers
# from `apps/desktop/node_modules` (bundled npm packages), which this backend has no clean way to
# reach: those are another app's dependencies in this monorepo, not something a Python service
# should read across a workspace boundary for. `pylsp` is different — it's resolved the exact same
# way the desktop already does (a `pylsp` on PATH, or `uvx --from python-lsp-server pylsp` as a
# fallback), and this backend already depends on `uv`/`uvx` for its own tooling, so there's no new
# dependency to justify. Extending this to TS/JSON would be a real, separate follow-up — either
# vendoring those servers as a backend dependency (a real decision, not a default) or exposing them
# through a new API the desktop's already-running LSP client answers instead of duplicating it.
_SUPPORTED_EXTENSIONS = {".py"}


class UnsupportedLanguageError(Exception):
    pass


def _resolve_pylsp_command() -> tuple[str, list[str]] | None:
    """A `pylsp` already on PATH is trusted as-is (whatever plugins its own environment installed
    is the user's choice, same as the desktop's `lsp-manager.ts`). The `uvx` fallback deliberately
    does **not** use the bare `python-lsp-server` package — real testing against this environment's
    `uvx` found that installs *zero* diagnostic-producing plugins (`pyflakes`/`pycodestyle`/`mccabe`
    all fail to load with `No module named ...`, confirmed via `pylsp`'s own `--log-file` output),
    since those linters are optional extras on PyPI, not the base package's dependencies — a
    `get_diagnostics` tool backed by a diagnostics-less language server would silently always
    report "no problems found," which is worse than an honest error. `[flake8]` pulls in exactly
    the pyflakes/pycodestyle/mccabe trio flake8 itself depends on, verified for real to produce
    genuine diagnostics (unused import, undefined name, pycodestyle spacing) against a real
    throwaway file in this environment."""
    pylsp = shutil.which("pylsp")
    if pylsp is not None:
        return pylsp, []
    uvx = shutil.which("uvx")
    if uvx is not None:
        return uvx, ["--from", "python-lsp-server[flake8]", "pylsp"]
    return None


@dataclass
class _WorkspaceClient:
    client: LspClient
    last_used: float


class LspClientManager:
    """One `pylsp` process per workspace, lazy-started on the first `get_diagnostics()` call,
    closed after `idle_timeout_seconds` of inactivity — the same "one long-lived resource per
    workspace, idle-swept" shape as `PlaywrightBrowserService`, including the same
    constructor-injectable timeout (the WebSocket gateway's own untested 30s idle timeout was an
    earlier phase's real gap this project doesn't repeat)."""

    def __init__(
        self,
        *,
        idle_timeout_seconds: float = DEFAULT_IDLE_TIMEOUT_SECONDS,
        check_interval_seconds: float = DEFAULT_IDLE_CHECK_INTERVAL_SECONDS,
    ) -> None:
        self._idle_timeout_seconds = idle_timeout_seconds
        self._check_interval_seconds = check_interval_seconds
        self._workspaces: dict[UUID, _WorkspaceClient] = {}
        self._lock = asyncio.Lock()
        self._sweep_task: asyncio.Task[None] | None = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        self._sweep_task = asyncio.create_task(self._sweep_loop())

    async def stop(self) -> None:
        self._stopped.set()
        if self._sweep_task is not None:
            self._sweep_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweep_task
        async with self._lock:
            for workspace_client in self._workspaces.values():
                await workspace_client.client.stop()
            self._workspaces.clear()

    async def _get_client(self, workspace_id: UUID, workspace_root: Path) -> LspClient:
        async with self._lock:
            existing = self._workspaces.get(workspace_id)
            if existing is not None:
                existing.last_used = time.monotonic()
                return existing.client

            resolved = _resolve_pylsp_command()
            if resolved is None:
                raise LspClientError(
                    "No Python language server available: install 'python-lsp-server' (pylsp) "
                    "or 'uv' and try again."
                )
            command, args = resolved
            client = LspClient(command=command, args=args, root_path=workspace_root)
            await client.start()
            self._workspaces[workspace_id] = _WorkspaceClient(client=client, last_used=time.monotonic())
            return client

    @staticmethod
    def is_supported(file_path: Path) -> bool:
        return file_path.suffix in _SUPPORTED_EXTENSIONS

    async def get_diagnostics(
        self,
        *,
        workspace_id: UUID,
        workspace_root: Path,
        file_path: Path,
        file_text: str,
        timeout: float = DEFAULT_DIAGNOSTICS_TIMEOUT_SECONDS,
    ) -> list[dict[str, Any]]:
        """`file_text` is read by the caller (`lsp_tools.py`, via `aiofiles` — never a synchronous
        read here) rather than this manager reading the file itself, keeping this class's only
        I/O the LSP subprocess's own stdio."""
        if not self.is_supported(file_path):
            raise UnsupportedLanguageError(
                f"No language server available for '{file_path.suffix}' files (only "
                f"{sorted(_SUPPORTED_EXTENSIONS)} are supported)"
            )
        client = await self._get_client(workspace_id, workspace_root)
        uri = path_to_uri(file_path)
        await client.open_document(uri, text=file_text, language_id="python")
        return await client.wait_for_diagnostics(uri, timeout=timeout)

    async def close_workspace(self, workspace_id: UUID) -> None:
        async with self._lock:
            workspace_client = self._workspaces.pop(workspace_id, None)
        if workspace_client is not None:
            await workspace_client.client.stop()

    async def _sweep_loop(self) -> None:
        while not self._stopped.is_set():
            await self._close_idle()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopped.wait(), timeout=self._check_interval_seconds)

    async def _close_idle(self) -> None:
        now = time.monotonic()
        async with self._lock:
            idle_ids = [
                workspace_id
                for workspace_id, workspace_client in self._workspaces.items()
                if now - workspace_client.last_used > self._idle_timeout_seconds
            ]
            idle_clients = [self._workspaces.pop(workspace_id).client for workspace_id in idle_ids]

        for client in idle_clients:
            logger.info("lsp_client_closed_idle")
            with contextlib.suppress(Exception):
                await client.stop()


# Built once at import time, started/stopped by `core/events.py`'s `on_startup`/`on_shutdown`,
# same convention as `infrastructure/browser/playwright_service.py`'s `browser_service`.
lsp_manager = LspClientManager()
