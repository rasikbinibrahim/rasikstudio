from __future__ import annotations

import asyncio
import shlex

import aiofiles.os

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool

_MAX_OUTPUT_CHARS = 20_000
_TIMEOUT_SECONDS = 300  # matches AGENT_FRAMEWORK.md §11's task-level timeout guard


async def _detect_default_command(workspace_root: str) -> str | None:
    if await aiofiles.os.path.isfile(f"{workspace_root}/pyproject.toml"):
        return "python -m pytest"
    if await aiofiles.os.path.isfile(f"{workspace_root}/package.json"):
        return "npm test"
    return None


@tool(
    name="run_tests",
    description="Run the workspace's test suite and return the output",
    parameters={
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Override the test command (default: auto-detected from the workspace)",
            }
        },
        "required": [],
    },
    risk=RiskLevel.HIGH,
)
async def run_tests(context: AgentContext, command: str | None = None) -> str:
    resolved_command = command or await _detect_default_command(str(context.workspace_root))
    if resolved_command is None:
        return "Error: Could not detect a test command for this workspace (no pyproject.toml or package.json)"

    try:
        argv = shlex.split(resolved_command)
    except ValueError as exc:
        return f"Error: Could not parse command: {exc}"

    try:
        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(context.workspace_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return f"Error: Command not found: {argv[0]}"

    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=_TIMEOUT_SECONDS)
    except TimeoutError:
        process.kill()
        await process.wait()
        return f"Error: Test run timed out after {_TIMEOUT_SECONDS}s: {resolved_command}"

    stdout_text = stdout.decode(errors="replace")[:_MAX_OUTPUT_CHARS]
    stderr_text = stderr.decode(errors="replace")[:_MAX_OUTPUT_CHARS]
    status = "passed" if process.returncode == 0 else "failed"
    return (
        f"Tests {status} (exit code {process.returncode})\n"
        f"--- stdout ---\n{stdout_text}\n--- stderr ---\n{stderr_text}"
    )


TEST_TOOLS = [run_tests]
