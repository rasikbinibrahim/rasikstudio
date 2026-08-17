from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from uuid import uuid4

import pytest

from app.infrastructure.lsp.manager import LspClientManager, UnsupportedLanguageError

# `pylsp`'s own diagnostic-producing plugins (pyflakes/pycodestyle/mccabe) are optional PyPI
# extras, not the base `python-lsp-server` package's dependencies — confirmed for real in this
# environment via `pylsp --log-file`'s own startup log, which showed every one of them failing to
# load ("No module named 'pyflakes'", etc.) when installed bare. `LspClientManager` resolves the
# `uvx` fallback with the `[flake8]` extra specifically to avoid shipping a diagnostics-less
# server that would silently always report "no problems found" — see `manager.py`'s
# `_resolve_pylsp_command()` docstring for the full finding.
pytestmark = pytest.mark.skipif(
    shutil.which("pylsp") is None and shutil.which("uvx") is None,
    reason="Neither 'pylsp' nor 'uvx' is on PATH in this environment",
)


@pytest.fixture
async def manager() -> LspClientManager:
    mgr = LspClientManager(idle_timeout_seconds=1, check_interval_seconds=0.2)
    yield mgr
    await mgr.stop()


async def test_real_pylsp_reports_real_diagnostics_for_a_broken_python_file(
    manager: LspClientManager, tmp_path: Path
) -> None:
    """Not mocked at any layer — a real `pylsp` (or `uvx --from python-lsp-server[flake8] pylsp`)
    subprocess is spawned, spoken to over real stdio JSON-RPC, and asked about a real file with a
    real unused import and a real undefined-name reference. Matches this project's own "real
    behavior beats a mock" standard for CLI-subprocess-backed services (`GitService`,
    `DockerService`, `PlaywrightBrowserService`)."""
    broken_file = tmp_path / "broken.py"
    broken_file.write_text("import os\n\ndef foo():\n    return undefined_name\n")

    diagnostics = await manager.get_diagnostics(
        workspace_id=uuid4(),
        workspace_root=tmp_path,
        file_path=broken_file,
        file_text=broken_file.read_text(),
        timeout=25,
    )

    messages = [d["message"] for d in diagnostics]
    assert any("undefined_name" in m for m in messages)
    assert any("os" in m and "unused" in m for m in messages)


async def test_real_pylsp_reports_no_diagnostics_for_a_clean_file(
    manager: LspClientManager, tmp_path: Path
) -> None:
    clean_file = tmp_path / "clean.py"
    clean_file.write_text("x = 1\n")

    diagnostics = await manager.get_diagnostics(
        workspace_id=uuid4(),
        workspace_root=tmp_path,
        file_path=clean_file,
        file_text=clean_file.read_text(),
        timeout=25,
    )

    assert diagnostics == []


async def test_two_files_in_the_same_workspace_reuse_one_pylsp_process(
    manager: LspClientManager, tmp_path: Path
) -> None:
    """The second call must not spawn a second `pylsp` — verified by checking only one
    `_WorkspaceClient` entry ever exists for the workspace id used by both calls."""
    workspace_id = uuid4()
    first = tmp_path / "first.py"
    first.write_text("x = 1\n")
    second = tmp_path / "second.py"
    second.write_text("y = 2\n")

    await manager.get_diagnostics(
        workspace_id=workspace_id,
        workspace_root=tmp_path,
        file_path=first,
        file_text=first.read_text(),
        timeout=25,
    )
    await manager.get_diagnostics(
        workspace_id=workspace_id,
        workspace_root=tmp_path,
        file_path=second,
        file_text=second.read_text(),
        timeout=25,
    )

    assert len(manager._workspaces) == 1


async def test_idle_client_is_closed_by_the_real_sweep(manager: LspClientManager, tmp_path: Path) -> None:
    """Real idle-timeout verification, not a mock — `manager`'s fixture sets a 1-second idle
    timeout and a 0.2-second sweep interval specifically so this can wait a real (short) amount
    of time rather than needing the production default of 15 minutes, the same pattern
    `PlaywrightBrowserService`'s own idle-close test already established."""
    workspace_id = uuid4()
    f = tmp_path / "x.py"
    f.write_text("x = 1\n")
    manager.start()
    try:
        await manager.get_diagnostics(
            workspace_id=workspace_id,
            workspace_root=tmp_path,
            file_path=f,
            file_text=f.read_text(),
            timeout=25,
        )
        assert workspace_id in manager._workspaces

        await asyncio.sleep(2)

        assert workspace_id not in manager._workspaces
    finally:
        await manager.stop()


async def test_unsupported_file_extension_raises_without_spawning_a_server(
    manager: LspClientManager, tmp_path: Path
) -> None:
    ts_file = tmp_path / "index.ts"
    ts_file.write_text("const x: number = 1;\n")

    with pytest.raises(UnsupportedLanguageError):
        await manager.get_diagnostics(
            workspace_id=uuid4(),
            workspace_root=tmp_path,
            file_path=ts_file,
            file_text=ts_file.read_text(),
            timeout=5,
        )
    assert len(manager._workspaces) == 0
