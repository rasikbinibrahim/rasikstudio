from __future__ import annotations

from app.agents.context import AgentContext
from app.agents.tools.registry import RiskLevel, tool
from app.infrastructure.browser.playwright_service import browser_service
from app.infrastructure.browser.ssrf_guard import SSRFBlockedError

# Risk levels, per AGENT_FRAMEWORK.md §11's convention (only High pauses for human approval):
# navigate/screenshot/get_text are Medium/Low — bounded, SSRF-guarded, or pure reads. click/type
# are High: they actively manipulate state on an arbitrary, real website (submit a form, delete a
# post, confirm a purchase) with no undo, the same "irreversible real-world action" category
# `write_file`/`run_command` are already unconditionally High for — see Decisions Log.


@tool(
    name="browser_navigate",
    description="Navigate the agent's headless browser to a URL (blocked for private/internal addresses)",
    parameters={
        "type": "object",
        "properties": {"url": {"type": "string", "description": "The URL to navigate to"}},
        "required": ["url"],
    },
    risk=RiskLevel.MEDIUM,
)
async def browser_navigate(url: str, context: AgentContext) -> str:
    try:
        await browser_service.navigate(context.workspace_id, url)
    except SSRFBlockedError as exc:
        return f"Error: {exc}"
    except Exception as exc:
        return f"Error: Navigation failed: {exc}"
    return f"Navigated to {url}"


@tool(
    name="browser_screenshot",
    description=(
        "Take a full-page screenshot of the agent's current browser page, returned as a "
        "base64-encoded PNG data URI"
    ),
    parameters={"type": "object", "properties": {}, "required": []},
    risk=RiskLevel.LOW,
)
async def browser_screenshot(context: AgentContext) -> str:
    # No separate WebSocket streaming path needed here — every tool result already streams over
    # the user's WS channel via `event_emitter.step(..., result=observation)` (base_agent.py),
    # so returning the data URI directly is what gets it to the desktop.
    try:
        encoded = await browser_service.screenshot(context.workspace_id)
    except Exception as exc:
        return f"Error: Screenshot failed: {exc}"
    return f"data:image/png;base64,{encoded}"


@tool(
    name="browser_click",
    description="Click an element on the agent's current browser page, identified by a CSS selector",
    parameters={
        "type": "object",
        "properties": {
            "selector": {"type": "string", "description": "CSS selector of the element to click"}
        },
        "required": ["selector"],
    },
    risk=RiskLevel.HIGH,
)
async def browser_click(selector: str, context: AgentContext) -> str:
    try:
        await browser_service.click(context.workspace_id, selector)
    except Exception as exc:
        return f"Error: Click failed: {exc}"
    return f"Clicked {selector}"


@tool(
    name="browser_type",
    description=(
        "Type text into an input element on the agent's current browser page, identified by a "
        "CSS selector"
    ),
    parameters={
        "type": "object",
        "properties": {
            "selector": {"type": "string", "description": "CSS selector of the input element"},
            "text": {"type": "string", "description": "Text to type into the element"},
        },
        "required": ["selector", "text"],
    },
    risk=RiskLevel.HIGH,
)
async def browser_type(selector: str, text: str, context: AgentContext) -> str:
    try:
        await browser_service.type_text(context.workspace_id, selector, text)
    except Exception as exc:
        return f"Error: Type failed: {exc}"
    return f"Typed into {selector}"


@tool(
    name="browser_get_text",
    description=(
        "Extract the visible text content of an element on the agent's current browser page, "
        "identified by a CSS selector"
    ),
    parameters={
        "type": "object",
        "properties": {"selector": {"type": "string", "description": "CSS selector of the element"}},
        "required": ["selector"],
    },
    risk=RiskLevel.LOW,
)
async def browser_get_text(selector: str, context: AgentContext) -> str:
    try:
        return await browser_service.get_text(context.workspace_id, selector)
    except Exception as exc:
        return f"Error: get_text failed: {exc}"


BROWSER_TOOLS = [browser_navigate, browser_screenshot, browser_click, browser_type, browser_get_text]
