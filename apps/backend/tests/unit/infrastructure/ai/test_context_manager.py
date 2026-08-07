from __future__ import annotations

from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.context_manager import (
    TRUNCATION_MARKER,
    get_context_window,
    truncate_messages,
)


def _count_chars(messages: list[Message]) -> int:
    return sum(len(m.content or "") for m in messages)


class TestGetContextWindow:
    def test_returns_the_known_window_for_a_listed_model(self) -> None:
        assert get_context_window("claude-sonnet-4-5") == 200_000

    def test_returns_the_default_for_an_unlisted_model(self) -> None:
        assert get_context_window("some-brand-new-model") == 8_192


class TestTruncateMessages:
    def test_returns_messages_unchanged_when_under_budget(self) -> None:
        messages = [
            Message(role="system", content="be helpful"),
            Message(role="user", content="hi"),
        ]
        result = truncate_messages(messages, "claude-sonnet-4-5", _count_chars)
        assert result == messages

    def test_truncates_middle_messages_and_inserts_marker_when_over_budget(self) -> None:
        system = Message(role="system", content="be helpful")
        old_turns = [
            Message(role="user", content=f"old question {i}") for i in range(20)
        ]
        last_user = Message(role="user", content="what's the latest?")
        messages = [system, *old_turns, last_user]

        # "some-brand-new-model" gets the 8_192-token default window (7_372 after the 0.9
        # threshold); 500 "tokens" per message means the full 22-message transcript (11_000)
        # is over budget but a truncated ~14-message one isn't, forcing the loop to actually run.
        def count_tokens(msgs: list[Message]) -> int:
            return len(msgs) * 500 * 500

        result = truncate_messages(messages, "some-brand-new-model", count_tokens)

        assert result[0] == system
        assert result[1] == Message(role="system", content=TRUNCATION_MARKER)
        assert result[-1] == last_user
        assert len(result) < len(messages)

    def test_always_preserves_the_last_user_message(self) -> None:
        system = Message(role="system", content="be helpful")
        messages = [system] + [
            Message(role="user" if i % 2 == 0 else "assistant", content=f"msg {i}") for i in range(30)
        ]

        def count_tokens(msgs: list[Message]) -> int:
            return len(msgs) * 500

        result = truncate_messages(messages, "some-brand-new-model", count_tokens)
        assert result[-1] == messages[-1]

    def test_preserves_all_system_messages(self) -> None:
        system1 = Message(role="system", content="rule one")
        system2 = Message(role="system", content="rule two")
        old_turns = [Message(role="user", content=f"old {i}") for i in range(20)]
        last_user = Message(role="user", content="latest")
        messages = [system1, system2, *old_turns, last_user]

        def count_tokens(msgs: list[Message]) -> int:
            return len(msgs) * 500

        result = truncate_messages(messages, "some-brand-new-model", count_tokens)
        assert system1 in result
        assert system2 in result

    def test_handles_no_system_message(self) -> None:
        old_turns = [Message(role="user", content=f"old {i}") for i in range(20)]
        last_user = Message(role="user", content="latest")
        messages = [*old_turns, last_user]

        def count_tokens(msgs: list[Message]) -> int:
            return len(msgs) * 500

        result = truncate_messages(messages, "some-brand-new-model", count_tokens)
        assert result[-1] == last_user
        assert any(m.content == TRUNCATION_MARKER for m in result)
