from __future__ import annotations

from app.agents.tools.registry import RiskLevel, ToolRegistry, tool


@tool(
    name="echo_tool",
    description="Echoes its input",
    parameters={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
    risk=RiskLevel.LOW,
)
async def echo_tool(text: str, context: object) -> str:
    return f"echo: {text}"


@tool(
    name="raising_tool",
    description="Always raises",
    parameters={"type": "object", "properties": {}, "required": []},
    risk=RiskLevel.LOW,
)
async def raising_tool(context: object) -> str:
    raise RuntimeError("boom")


class TestRegisteredTool:
    async def test_is_directly_callable(self) -> None:
        assert await echo_tool(text="hi", context=None) == "echo: hi"


class TestToolRegistry:
    def test_as_ai_tools_exposes_the_schema(self) -> None:
        registry = ToolRegistry([echo_tool])
        tools = registry.as_ai_tools()
        assert len(tools) == 1
        assert tools[0].name == "echo_tool"
        assert tools[0].parameters == echo_tool.parameters

    def test_contains_and_len(self) -> None:
        registry = ToolRegistry([echo_tool])
        assert "echo_tool" in registry
        assert "missing" not in registry
        assert len(registry) == 1

    async def test_execute_runs_the_tool(self) -> None:
        registry = ToolRegistry([echo_tool])
        result = await registry.execute("echo_tool", {"text": "hi"}, context=None)
        assert result == "echo: hi"

    async def test_execute_unknown_tool_returns_an_error_string(self) -> None:
        registry = ToolRegistry([echo_tool])
        result = await registry.execute("nonexistent", {}, context=None)
        assert result == "Error: Unknown tool 'nonexistent'"

    async def test_execute_invalid_arguments_returns_an_error_string(self) -> None:
        registry = ToolRegistry([echo_tool])
        result = await registry.execute("echo_tool", {"wrong_arg": "x"}, context=None)
        assert result.startswith("Error: Invalid arguments")

    async def test_execute_never_raises_even_when_the_tool_body_does(self) -> None:
        registry = ToolRegistry([raising_tool])
        result = await registry.execute("raising_tool", {}, context=None)
        assert result == "Error: Tool 'raising_tool' failed unexpectedly"
