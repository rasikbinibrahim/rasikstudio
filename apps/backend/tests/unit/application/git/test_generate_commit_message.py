import pytest

from app.application.git.generate_commit_message import (
    MAX_DIFF_CHARS,
    GenerateCommitMessageRequest,
    GenerateCommitMessageUseCase,
)
from app.core.errors import ValidationError
from app.domain.ports.ai_provider import CompletionResult, TokenUsage


class FakeModelRouter:
    def __init__(self, content: str | None) -> None:
        self._content = content
        self.calls: list[dict] = []

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, **kwargs):
        self.calls.append(
            {"messages": messages, "model": model, "temperature": temperature, "max_tokens": max_tokens}
        )
        return CompletionResult(
            content=self._content,
            tool_calls=None,
            finish_reason="stop",
            usage=TokenUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15),
        )


class TestGenerateCommitMessageUseCase:
    async def test_returns_the_model_generated_message(self) -> None:
        router = FakeModelRouter(content="fix: correct off-by-one in pagination")
        use_case = GenerateCommitMessageUseCase(router)

        message = await use_case.execute(
            GenerateCommitMessageRequest(diff="diff --git a/x b/x\n+1 line", model="claude-x")
        )

        assert message == "fix: correct off-by-one in pagination"

    async def test_sends_a_system_prompt_and_the_diff_as_the_user_message(self) -> None:
        router = FakeModelRouter(content="chore: update deps")
        use_case = GenerateCommitMessageUseCase(router)

        await use_case.execute(GenerateCommitMessageRequest(diff="the diff", model="claude-x"))

        sent = router.calls[0]["messages"]
        assert sent[0].role == "system"
        assert sent[1].role == "user"
        assert sent[1].content == "the diff"

    async def test_passes_the_requested_model_through_to_the_router(self) -> None:
        router = FakeModelRouter(content="chore: update deps")
        use_case = GenerateCommitMessageUseCase(router)

        await use_case.execute(GenerateCommitMessageRequest(diff="the diff", model="gpt-4o"))

        assert router.calls[0]["model"] == "gpt-4o"

    async def test_truncates_an_oversized_diff_before_sending_it(self) -> None:
        router = FakeModelRouter(content="chore: big change")
        use_case = GenerateCommitMessageUseCase(router)
        huge_diff = "x" * (MAX_DIFF_CHARS * 2)

        await use_case.execute(GenerateCommitMessageRequest(diff=huge_diff, model="claude-x"))

        sent_user_content = router.calls[0]["messages"][1].content
        assert len(sent_user_content) == MAX_DIFF_CHARS

    async def test_rejects_an_empty_diff_without_calling_the_router(self) -> None:
        router = FakeModelRouter(content="should not be reached")
        use_case = GenerateCommitMessageUseCase(router)

        with pytest.raises(ValidationError):
            await use_case.execute(GenerateCommitMessageRequest(diff="   ", model="claude-x"))

        assert router.calls == []

    async def test_raises_when_the_model_returns_an_empty_completion(self) -> None:
        router = FakeModelRouter(content="   ")
        use_case = GenerateCommitMessageUseCase(router)

        with pytest.raises(ValidationError):
            await use_case.execute(GenerateCommitMessageRequest(diff="the diff", model="claude-x"))
