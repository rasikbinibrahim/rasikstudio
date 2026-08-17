from __future__ import annotations

import aiofiles
import aiofiles.os

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool
from app.domain.services.path_validator import WorkspacePathError, resolve_workspace_path
from app.infrastructure.lsp.client import LspClientError
from app.infrastructure.lsp.manager import UnsupportedLanguageError, lsp_manager


@tool(
    name="get_diagnostics",
    description=(
        "Get real language-server diagnostics (errors, warnings, type issues) for a file in the "
        "workspace. Currently supports Python files only."
    ),
    parameters={
        "type": "object",
        "properties": {"path": {"type": "string", "description": "Relative path from workspace root"}},
        "required": ["path"],
    },
    risk=RiskLevel.LOW,
)
async def get_diagnostics(path: str, context: AgentContext) -> str:
    try:
        abs_path = resolve_workspace_path(context.workspace_root, path)
    except WorkspacePathError:
        return f"Error: Path outside workspace: {path}"

    if not await aiofiles.os.path.isfile(abs_path):
        return f"Error: File not found: {path}"

    if not lsp_manager.is_supported(abs_path):
        return f"Error: No language server available for '{abs_path.suffix}' files (only .py is supported)"

    async with aiofiles.open(abs_path, encoding="utf-8") as f:
        text = await f.read()

    try:
        diagnostics = await lsp_manager.get_diagnostics(
            workspace_id=context.workspace_id,
            workspace_root=context.workspace_root,
            file_path=abs_path,
            file_text=text,
        )
    except UnsupportedLanguageError as exc:
        return f"Error: {exc}"
    except LspClientError as exc:
        return f"Error: {exc}"

    if not diagnostics:
        return f"No diagnostics found in {path}"

    lines = [f"{len(diagnostics)} diagnostic(s) in {path}:"]
    for diag in diagnostics:
        severity_code = diag.get("severity")
        severity = _SEVERITY_NAMES.get(severity_code, "info") if isinstance(severity_code, int) else "info"
        start = (diag.get("range") or {}).get("start", {})
        line_no = start.get("line", 0) + 1
        col_no = start.get("character", 0) + 1
        message = diag.get("message", "")
        source = diag.get("source")
        prefix = f"[{source}] " if source else ""
        lines.append(f"  {severity} at {line_no}:{col_no} — {prefix}{message}")
    return "\n".join(lines)


# LSP `DiagnosticSeverity`: 1=Error, 2=Warning, 3=Information, 4=Hint.
_SEVERITY_NAMES = {1: "error", 2: "warning", 3: "info", 4: "hint"}

LSP_TOOLS = [get_diagnostics]
