from __future__ import annotations

from app.agents.context import AgentContext
from app.agents.running_tasks import AgentQuestionCancelled, running_tasks
from app.agents.tools.registry import RiskLevel, tool


@tool(
    name="ask_followup_question",
    description=(
        "Ask the user an open-ended clarifying question and wait for their answer before "
        "proceeding. Use this when the task is genuinely ambiguous and guessing wrong would be "
        "expensive to undo — not for anything answerable by reading the workspace yourself, and "
        "not as a substitute for the approval gate that already covers high-risk actions."
    ),
    parameters={
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The specific question to ask the user.",
            },
        },
        "required": ["question"],
    },
    risk=RiskLevel.LOW,
)
async def ask_followup_question(context: AgentContext, question: str) -> str:
    """Cline's `ask_followup_question` tool (`docs/reference/cline/TOOL_DESIGN_NOTES.md`) —
    previously this project's agent had no mid-task equivalent of "pause and ask," only the
    binary approve/deny gate on already-decided high-risk actions. `BaseAgent.run()` wraps this
    call with a `paused`/`running` DB status transition (mirroring `_await_approval`'s own
    wrapping of `_execute_step`); this function itself only needs to publish the real-time WS
    event and block for the answer, which is exactly `running_tasks`' existing one-shot BLPOP
    hand-off shape, reused rather than duplicated for a second mechanism.

    A cancellation mid-wait doesn't raise out of this call — it's caught here and turned into a
    plain observation string, so the ReAct loop's normal `_check_cancelled()` checkpoint (not an
    unhandled exception bubbling out of a tool call) is what actually ends the task, the same
    contract every other tool in this package honors."""
    await context.event_emitter.question_asked(context.task_id, question=question)
    try:
        return await running_tasks.wait_for_answer(context.task_id, context.redis)
    except AgentQuestionCancelled:
        return "Cancelled by user"


INTERACTION_TOOLS = [ask_followup_question]
