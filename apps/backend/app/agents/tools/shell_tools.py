from __future__ import annotations

import asyncio
import shlex

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool

_MAX_OUTPUT_CHARS = 10_000
_DEFAULT_TIMEOUT_SECONDS = 30


@tool(
    name="run_command",
    description="Execute a shell command in the workspace root and return its output",
    parameters={
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "The command to run, e.g. 'ls -la'"},
            "timeout_seconds": {"type": "integer", "description": "Max seconds to wait (default 30)"},
        },
        "required": ["command"],
    },
    risk=RiskLevel.HIGH,
)
async def run_command(
    command: str, context: AgentContext, timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS
) -> str:
    """`command` is tokenized with `shlex.split()` and passed to `create_subprocess_exec(*argv)` —
    never `create_subprocess_shell()` or `shell=True` — so shell metacharacters in the string
    (`;`, `|`, `` ` ``, `$(...)`) are just literal argv tokens to the first program, not
    shell-interpreted. A single free-form string is still the parameter (matching how an LLM
    naturally produces a command) without ever handing that string to an actual shell."""
    try:
        argv = shlex.split(command)
    except ValueError as exc:
        return f"Error: Could not parse command: {exc}"
    if not argv:
        return "Error: Empty command"

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
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
    except TimeoutError:
        process.kill()
        await process.wait()
        return f"Error: Command timed out after {timeout_seconds}s: {command}"

    stdout_text = stdout.decode(errors="replace")[:_MAX_OUTPUT_CHARS]
    stderr_text = stderr.decode(errors="replace")[:_MAX_OUTPUT_CHARS]
    return f"Exit code: {process.returncode}\n--- stdout ---\n{stdout_text}\n--- stderr ---\n{stderr_text}"


SHELL_TOOLS = [run_command]
