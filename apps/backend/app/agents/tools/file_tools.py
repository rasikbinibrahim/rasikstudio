from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

import aiofiles
import aiofiles.os

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool
from app.domain.services.path_validator import WorkspacePathError, resolve_workspace_path

# Security requirement (tools/README.md): every tool here validates its path against
# `resolve_workspace_path()` before touching the filesystem, and uses `aiofiles` — never a
# synchronous `Path.read_text()`/`write_text()` — since a synchronous call would block the event
# loop for every other concurrent agent task and every unrelated request the process is serving.


def _safe_path(context: AgentContext, path: str) -> Path | None:
    try:
        return resolve_workspace_path(context.workspace_root, path)
    except WorkspacePathError:
        return None


@tool(
    name="read_file",
    description="Read the content of a file in the workspace",
    parameters={
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Relative path from workspace root"}},
        "required": ["path"],
    },
    risk=RiskLevel.LOW,
)
async def read_file(path: str, context: AgentContext) -> str:
    abs_path = _safe_path(context, path)
    if abs_path is None:
        return f"Error: Path outside workspace: {path}"
    if not await aiofiles.os.path.isfile(abs_path):
        return f"Error: File not found: {path}"
    async with aiofiles.open(abs_path, encoding="utf-8") as f:
        return await f.read()


@tool(
    name="write_file",
    description="Write content to a file in the workspace, creating it if it doesn't exist and "
    "overwriting it if it does",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path from workspace root"},
            "content": {"type": "string", "description": "Full file content to write"},
        },
        "required": ["path", "content"],
    },
    risk=RiskLevel.HIGH,
)
async def write_file(path: str, content: str, context: AgentContext) -> str:
    abs_path = _safe_path(context, path)
    if abs_path is None:
        return f"Error: Path outside workspace: {path}"
    await aiofiles.os.makedirs(abs_path.parent, exist_ok=True)
    async with aiofiles.open(abs_path, "w", encoding="utf-8") as f:
        await f.write(content)
    return f"Wrote {len(content)} bytes to {path}"


@tool(
    name="patch_file",
    description="Apply a unified diff patch to an existing file",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path from workspace root"},
            "diff": {"type": "string", "description": "Unified diff content to apply"},
        },
        "required": ["path", "diff"],
    },
    risk=RiskLevel.MEDIUM,
)
async def patch_file(path: str, diff: str, context: AgentContext) -> str:
    """Applies `diff` to the file at the already-validated `path` — the file argument is passed
    explicitly to `patch(1)` rather than letting `patch` parse the target from the diff's own
    `+++`/`---` headers, so a diff whose headers claim a different (possibly out-of-workspace)
    path still only ever touches the one file `resolve_workspace_path()` already cleared."""
    abs_path = _safe_path(context, path)
    if abs_path is None:
        return f"Error: Path outside workspace: {path}"
    if not await aiofiles.os.path.isfile(abs_path):
        return f"Error: File not found: {path}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False) as tmp:
        tmp.write(diff)
        diff_path = tmp.name

    try:
        process = await asyncio.create_subprocess_exec(
            "patch",
            "--batch",
            "--forward",
            "--quiet",
            str(abs_path),
            "-i",
            diff_path,
            cwd=str(context.workspace_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
    finally:
        await aiofiles.os.remove(diff_path)

    if process.returncode != 0:
        message = (stderr or stdout).decode(errors="replace").strip()
        return f"Error: Failed to apply patch to {path}: {message}"
    return f"Applied patch to {path}"


@tool(
    name="delete_file",
    description="Delete a file in the workspace",
    parameters={
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Relative path from workspace root"}},
        "required": ["path"],
    },
    risk=RiskLevel.HIGH,
)
async def delete_file(path: str, context: AgentContext) -> str:
    abs_path = _safe_path(context, path)
    if abs_path is None:
        return f"Error: Path outside workspace: {path}"
    if not await aiofiles.os.path.isfile(abs_path):
        return f"Error: File not found: {path}"
    await aiofiles.os.remove(abs_path)
    return f"Deleted {path}"


@tool(
    name="list_directory",
    description="List the contents of a directory in the workspace",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path from workspace root ('.' for root)"}
        },
        "required": ["path"],
    },
    risk=RiskLevel.LOW,
)
async def list_directory(path: str, context: AgentContext) -> str:
    abs_path = _safe_path(context, path)
    if abs_path is None:
        return f"Error: Path outside workspace: {path}"
    if not await aiofiles.os.path.isdir(abs_path):
        return f"Error: Directory not found: {path}"
    entries = await aiofiles.os.listdir(abs_path)
    lines = []
    for name in sorted(entries):
        kind = "dir" if await aiofiles.os.path.isdir(abs_path / name) else "file"
        lines.append(f"{kind}\t{name}")
    return "\n".join(lines) if lines else "(empty directory)"


FILE_TOOLS = [read_file, write_file, patch_file, delete_file, list_directory]
