from __future__ import annotations

import asyncio

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool

_MAX_OUTPUT_CHARS = 20_000


async def _run_git(*args: str, cwd: str) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    return (
        process.returncode or 0,
        stdout.decode(errors="replace")[:_MAX_OUTPUT_CHARS],
        stderr.decode(errors="replace")[:_MAX_OUTPUT_CHARS],
    )


@tool(
    name="get_git_status",
    description="Get the working tree status of the workspace's Git repository",
    parameters={"type": "object", "properties": {}, "required": []},
    risk=RiskLevel.LOW,
)
async def get_git_status(context: AgentContext) -> str:
    code, stdout, stderr = await _run_git(
        "status", "--porcelain=v1", "--branch", cwd=str(context.workspace_root)
    )
    if code != 0:
        return f"Error: git status failed: {stderr.strip()}"
    return stdout.strip() or "(clean working tree)"


@tool(
    name="git_diff",
    description="Get the diff for a file (or the whole workspace if no path is given)",
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path to diff (omit for the whole tree)"}
        },
        "required": [],
    },
    risk=RiskLevel.LOW,
)
async def git_diff(context: AgentContext, path: str | None = None) -> str:
    args = ["diff", "--", path] if path else ["diff"]
    code, stdout, stderr = await _run_git(*args, cwd=str(context.workspace_root))
    if code != 0:
        return f"Error: git diff failed: {stderr.strip()}"
    return stdout if stdout.strip() else "(no changes)"


GIT_TOOLS = [get_git_status, git_diff]
