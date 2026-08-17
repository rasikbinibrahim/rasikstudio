from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from app.infrastructure.lsp.client import LspClient, LspClientError, path_to_uri

# `LspClient`'s real end-to-end behavior (spawn a real server, initialize, open a document, get
# real diagnostics back) is covered by `tests/integration/infrastructure/lsp/
# test_lsp_manager_integration.py` against a real `pylsp`. These unit tests exercise the protocol
# framing/dispatch logic in isolation (a fake stdout feed, no real subprocess) — the parts a real
# server round-trip can't cheaply target one at a time, like a malformed/truncated message stream
# or a request that times out because nothing ever answers it.


def _framed(message: dict) -> bytes:
    body = json.dumps(message).encode("utf-8")
    return f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body


class _FakeStdin:
    def __init__(self) -> None:
        self.written: list[bytes] = []

    def write(self, data: bytes) -> None:
        self.written.append(data)

    @property
    def last_message(self) -> dict:
        raw = self.written[-1]
        _, _, body = raw.partition(b"\r\n\r\n")
        return json.loads(body)


def _client_with_fake_io(feed: bytes) -> tuple[LspClient, _FakeStdin]:
    client = LspClient(command="fake-lsp", args=[], root_path=Path("/tmp/does-not-matter"))
    stdin = _FakeStdin()
    process = asyncio.subprocess.Process.__new__(asyncio.subprocess.Process)  # not started for real
    client._process = process  # type: ignore[assignment]
    client._process.stdin = stdin  # type: ignore[attr-defined]

    reader = asyncio.StreamReader()
    reader.feed_data(feed)
    reader.feed_eof()
    client._process.stdout = reader  # type: ignore[attr-defined]
    return client, stdin


class TestWriteFraming:
    # Async, not sync — `_client_with_fake_io` constructs a real `asyncio.StreamReader`, which
    # (as of this Python version) needs a running event loop; a plain `def` test run after other
    # async tests have already closed their own loops has none, raising `RuntimeError: There is
    # no current event loop`. `asyncio_mode = "auto"` (pyproject.toml) gives every `async def`
    # test its own running loop, sidestepping the issue entirely.
    async def test_writes_a_correctly_framed_content_length_header(self) -> None:
        client, stdin = _client_with_fake_io(b"")
        client._notify("textDocument/didOpen", {"textDocument": {"uri": "file:///x.py"}})

        raw = stdin.written[0]
        header, _, body = raw.partition(b"\r\n\r\n")
        assert header == f"Content-Length: {len(body)}".encode("ascii")
        assert json.loads(body)["method"] == "textDocument/didOpen"

    async def test_raises_if_the_process_has_no_stdin_yet(self) -> None:
        client = LspClient(command="fake-lsp", args=[], root_path=Path("/tmp"))
        with pytest.raises(LspClientError):
            client._notify("initialized", {})


class TestReadLoopDispatch:
    async def test_a_publish_diagnostics_notification_is_cached_and_wakes_a_waiter(self) -> None:
        uri = "file:///broken.py"
        feed = _framed(
            {
                "jsonrpc": "2.0",
                "method": "textDocument/publishDiagnostics",
                "params": {"uri": uri, "diagnostics": [{"message": "boom", "severity": 1}]},
            }
        )
        client, _ = _client_with_fake_io(feed)

        await client._read_loop()

        diagnostics = await client.wait_for_diagnostics(uri, timeout=1)
        assert diagnostics == [{"message": "boom", "severity": 1}]

    async def test_a_response_with_a_matching_id_resolves_the_pending_future(self) -> None:
        feed = _framed({"jsonrpc": "2.0", "id": 1, "result": {"capabilities": {}}})
        client, _ = _client_with_fake_io(feed)
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        client._pending[1] = future

        await client._read_loop()

        assert future.done()
        assert future.result() == {"capabilities": {}}

    async def test_an_error_response_sets_an_exception_on_the_pending_future(self) -> None:
        feed = _framed({"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "bad"}})
        client, _ = _client_with_fake_io(feed)
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        client._pending[1] = future

        await client._read_loop()

        assert future.done()
        with pytest.raises(LspClientError):
            future.result()

    async def test_a_truncated_stream_ends_the_read_loop_without_raising(self) -> None:
        client, _ = _client_with_fake_io(b"Content-Length: 100\r\n\r\n{\"incomplete")
        await client._read_loop()  # must not raise — an EOF mid-body is a real, non-fatal case


class TestWaitForDiagnosticsTimeout:
    async def test_raises_a_client_error_if_nothing_ever_publishes_for_that_uri(self) -> None:
        client, _ = _client_with_fake_io(b"")
        with pytest.raises(LspClientError, match="Timed out"):
            await client.wait_for_diagnostics("file:///never.py", timeout=0.05)


def test_path_to_uri_produces_a_file_scheme_uri() -> None:
    uri = path_to_uri(Path("/tmp/some file.py"))
    assert uri.startswith("file:///tmp/some%20file.py") or uri.startswith("file:///tmp/some file.py")
