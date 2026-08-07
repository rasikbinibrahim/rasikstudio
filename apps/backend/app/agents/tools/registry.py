from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import structlog

from app.agents.context import AgentContext
from app.domain.ports.ai_provider import Tool

logger = structlog.get_logger("agents.tools.registry")

ToolFunc = Callable[..., Awaitable[str]]


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True, slots=True)
class RegisteredTool:
    """Returned by `@tool(...)` in place of the bare function — callable via `__call__` (forwards
    to the original function, so direct calls/tests read exactly like calling the undecorated
    function), and also carries the schema `ToolRegistry`/`ModelRouter` need. A plain-function
    decorator would have lost the schema the moment the function was assigned to its module-level
    name; wrapping it in a dataclass keeps both together without a second global registration
    step happening as an import-time side effect."""

    name: str
    description: str
    parameters: dict[str, Any]
    risk: RiskLevel
    func: ToolFunc

    async def __call__(self, *args: Any, **kwargs: Any) -> str:
        return await self.func(*args, **kwargs)


def tool(
    *, name: str, description: str, parameters: dict[str, Any], risk: RiskLevel
) -> Callable[[ToolFunc], RegisteredTool]:
    def decorator(func: ToolFunc) -> RegisteredTool:
        return RegisteredTool(name=name, description=description, parameters=parameters, risk=risk, func=func)

    return decorator


class ToolRegistry:
    """Built explicitly from a list of `RegisteredTool`s (typically each `agents/tools/*.py`
    module's exported list, concatenated by `agent_factory.py` per agent type) rather than a
    module-level singleton every `@tool`-decorated function auto-registers into — no import-order
    coupling, and tests can build a registry from a handful of fakes without importing (or
    accidentally executing) every real tool module."""

    def __init__(self, tools: list[RegisteredTool]) -> None:
        self._tools = {t.name: t for t in tools}

    def get(self, name: str) -> RegisteredTool | None:
        return self._tools.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)

    def as_ai_tools(self) -> list[Tool]:
        """Converts every registered tool to the `Tool` shape `AIProvider.complete()`/`.stream()`
        expect (`domain/ports/ai_provider.py`) — this is what actually gets sent to the model so
        it knows what it can call."""
        return [
            Tool(name=t.name, description=t.description, parameters=t.parameters)
            for t in self._tools.values()
        ]

    async def execute(self, name: str, arguments: dict[str, Any], *, context: AgentContext) -> str:
        """Never raises — a tool failure (unknown tool, bad arguments, or an exception from the
        tool body itself) becomes an `"Error: ..."` string result instead, per AGENT_FRAMEWORK.md
        §13: the agent observes the failure and decides how to react, rather than the whole task
        crashing because one tool call went wrong."""
        spec = self.get(name)
        if spec is None:
            return f"Error: Unknown tool '{name}'"
        try:
            return await spec.func(context=context, **arguments)
        except TypeError as exc:
            return f"Error: Invalid arguments for tool '{name}': {exc}"
        except Exception:
            logger.exception("tool_execution_failed", tool=name)
            return f"Error: Tool '{name}' failed unexpectedly"
