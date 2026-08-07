from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import ValidationError
from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.model_router import ModelRouter

MAX_DIFF_CHARS = 20_000
"""`ModelRouter.complete()` already truncates by token budget, but a git diff can be enormous
(binary-adjacent, generated files) well before that — trimming here keeps an oversized diff from
silently blowing the whole context budget on itself and starving the system prompt of context that
would otherwise survive `truncate_messages()`'s "preserve system + last user message" rule."""

_SYSTEM_PROMPT = (
    "You write git commit messages. Given a diff, respond with ONLY the commit message: a short "
    "imperative-mood summary line under 72 characters, optionally followed by a blank line and a "
    "brief body explaining why the change was made. No markdown formatting, no commentary, no "
    "quotes around the message."
)


@dataclass(frozen=True, slots=True)
class GenerateCommitMessageRequest:
    diff: str
    model: str


class GenerateCommitMessageUseCase:
    """Per `phase-12-git-integration.md`'s `GitService.generateCommitMessage(diff)` — the desktop
    Git panel's "Generate" button sends the staged diff here rather than the Electron main process
    calling an AI provider directly, matching every other AI call in this codebase (chat, agents)
    going through the backend's `ModelRouter` for fallback/caching/truncation, not a second,
    desktop-side AI integration."""

    def __init__(self, model_router: ModelRouter) -> None:
        self._model_router = model_router

    async def execute(self, request: GenerateCommitMessageRequest) -> str:
        diff = request.diff.strip()
        if not diff:
            raise ValidationError("Diff is empty — nothing to summarize", code="empty_diff")

        truncated = diff[:MAX_DIFF_CHARS]
        messages = [
            Message(role="system", content=_SYSTEM_PROMPT),
            Message(role="user", content=truncated),
        ]
        result = await self._model_router.complete(
            messages, model=request.model, temperature=0.3, max_tokens=256
        )
        content = (result.content or "").strip()
        if not content:
            raise ValidationError(
                "Model returned an empty commit message", code="empty_completion"
            )
        return content
