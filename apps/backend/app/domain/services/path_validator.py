from __future__ import annotations

from pathlib import Path


class WorkspacePathError(Exception):
    """Raised by `resolve_workspace_path()` for a path that escapes the workspace root — a plain
    `Exception`, not `core.errors.RasikStudioError`, since `domain/` may not import from `core/`
    (see `domain/README.md`'s Dependency Rule). Callers outside the domain layer (agent tools,
    API handlers) catch this and translate it into whatever their own layer's convention is —
    `agents/tools/file_tools.py` turns it into a tool-observation error string, per
    AGENT_FRAMEWORK.md §13 ("the agent is not allowed to silently ignore errors, but a tool
    failure is an observation, not a crash")."""


def resolve_workspace_path(workspace_root: Path, relative_path: str) -> Path:
    """Resolves `relative_path` against `workspace_root` and guarantees the result stays inside
    it. Mirrors `apps/desktop/electron/main/lib/workspace-path.ts`'s `resolveWorkspacePath` —
    same traversal-guard logic, reimplemented here because agent file tools run in the backend
    process, not the Electron main process, and have no shared runtime with the desktop app."""
    root = workspace_root.resolve()
    candidate = (root / relative_path).resolve()

    if candidate != root and root not in candidate.parents:
        raise WorkspacePathError(f"Path outside workspace: {relative_path}")

    return candidate
