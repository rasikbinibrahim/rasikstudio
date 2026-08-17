from __future__ import annotations

import asyncio
import contextlib
import json
from pathlib import Path
from typing import Any
from urllib.request import pathname2url

import structlog

logger = structlog.get_logger("lsp.client")

_ENCODING = "utf-8"
_HEADER_TERMINATOR = b"\r\n\r\n"
_DEFAULT_INITIALIZE_TIMEOUT_SECONDS = 15.0
_DEFAULT_REQUEST_TIMEOUT_SECONDS = 10.0


class LspClientError(Exception):
    """Raised when the server process can't be started, or a request fails/times out."""


def path_to_uri(path: Path) -> str:
    """A minimal, dependency-free `file://` URI builder — every LSP server this client talks to
    (`pylsp`, per this module's only real caller) accepts this form. `pathname2url` handles
    Windows-drive-letter and space/unicode escaping the same way `urllib`'s own `file://` helpers
    would, without pulling in a third-party URI library for one conversion."""
    return f"file://{pathname2url(str(path.resolve()))}"


class LspClient:
    """A real LSP client speaking the protocol's Content-Length-framed JSON-RPC over a spawned
    language server's stdio — no third-party LSP client library, mirroring this project's own
    "no shell interpolation, own the subprocess" convention (`GitService`, `DockerService`,
    `run_command`'s tool). Deliberately minimal: only what `get_diagnostics` (the one real caller,
    `app/agents/tools/lsp_tools.py`) needs — `initialize`/`initialized`, `textDocument/didOpen`,
    and consuming `textDocument/publishDiagnostics` notifications. Not a general-purpose LSP
    client (no completion/hover/definition — those are the desktop's own `lsp-client.ts`'s job,
    a separate Electron/TS client this backend has no way to reach into)."""

    def __init__(self, *, command: str, args: list[str], root_path: Path) -> None:
        self._command = command
        self._args = args
        self._root_path = root_path
        self._process: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._next_id = 1
        self._pending: dict[int, asyncio.Future[Any]] = {}
        self._diagnostics: dict[str, list[dict[str, Any]]] = {}
        self._diagnostics_events: dict[str, asyncio.Event] = {}
        self._stopped = False

    async def start(self) -> None:
        try:
            self._process = await asyncio.create_subprocess_exec(
                self._command,
                *self._args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError as exc:
            raise LspClientError(f"Failed to start language server '{self._command}': {exc}") from exc

        self._reader_task = asyncio.create_task(self._read_loop())

        await self._request(
            "initialize",
            {
                "processId": None,
                "rootUri": path_to_uri(self._root_path),
                "capabilities": {
                    "textDocument": {"publishDiagnostics": {"relatedInformation": True}}
                },
            },
            timeout=_DEFAULT_INITIALIZE_TIMEOUT_SECONDS,
        )
        self._notify("initialized", {})

    async def stop(self) -> None:
        self._stopped = True
        if self._process is not None and self._process.returncode is None:
            with contextlib.suppress(LspClientError, TimeoutError):
                await asyncio.wait_for(
                    self._request("shutdown", None, timeout=_DEFAULT_REQUEST_TIMEOUT_SECONDS), timeout=5
                )
            self._notify("exit", None)
        if self._reader_task is not None:
            self._reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._reader_task
        if self._process is not None and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except TimeoutError:
                self._process.kill()

    async def open_document(self, uri: str, *, text: str, language_id: str) -> None:
        self._diagnostics_events.setdefault(uri, asyncio.Event())
        self._notify(
            "textDocument/didOpen",
            {
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": text,
                }
            },
        )

    async def wait_for_diagnostics(self, uri: str, *, timeout: float) -> list[dict[str, Any]]:
        """Diagnostics are server-pushed (`textDocument/publishDiagnostics`), not pull-based, so
        this waits for the first notification the server sends for `uri` after `open_document()`
        — including a real empty list, which is a legitimate "no problems found" result and
        distinct from "the server never responded" (which raises on timeout instead)."""
        event = self._diagnostics_events.setdefault(uri, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except TimeoutError as exc:
            raise LspClientError(
                f"Timed out after {timeout}s waiting for diagnostics from '{self._command}'"
            ) from exc
        return self._diagnostics.get(uri, [])

    def _notify(self, method: str, params: Any) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})

    async def _request(self, method: str, params: Any, *, timeout: float) -> Any:
        request_id = self._next_id
        self._next_id += 1
        future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()
        self._pending[request_id] = future
        self._write({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError as exc:
            self._pending.pop(request_id, None)
            raise LspClientError(f"Timed out waiting for '{method}' response") from exc

    def _write(self, message: dict[str, Any]) -> None:
        if self._process is None or self._process.stdin is None:
            raise LspClientError("Language server process is not running")
        body = json.dumps(message).encode(_ENCODING)
        header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
        self._process.stdin.write(header + body)

    async def _read_loop(self) -> None:
        assert self._process is not None and self._process.stdout is not None
        stdout = self._process.stdout
        try:
            while not self._stopped:
                headers = await self._read_headers(stdout)
                if headers is None:
                    break
                content_length = int(headers.get("content-length", "0"))
                if content_length <= 0:
                    continue
                body = await stdout.readexactly(content_length)
                self._dispatch(json.loads(body.decode(_ENCODING)))
        except asyncio.IncompleteReadError:
            pass
        except asyncio.CancelledError:
            raise

    @staticmethod
    async def _read_headers(stdout: asyncio.StreamReader) -> dict[str, str] | None:
        raw = b""
        while not raw.endswith(_HEADER_TERMINATOR):
            chunk = await stdout.readline()
            if not chunk:
                return None
            raw += chunk
        headers: dict[str, str] = {}
        for line in raw.decode("ascii").split("\r\n"):
            if ":" in line:
                key, _, value = line.partition(":")
                headers[key.strip().lower()] = value.strip()
        return headers

    def _dispatch(self, message: dict[str, Any]) -> None:
        if "id" in message and message["id"] in self._pending:
            future = self._pending.pop(message["id"])
            if future.done():
                return
            if "error" in message:
                future.set_exception(LspClientError(str(message["error"])))
            else:
                future.set_result(message.get("result"))
            return

        if message.get("method") == "textDocument/publishDiagnostics":
            params = message.get("params") or {}
            uri = params.get("uri")
            if uri is None:
                return
            self._diagnostics[uri] = params.get("diagnostics", [])
            self._diagnostics_events.setdefault(uri, asyncio.Event()).set()
