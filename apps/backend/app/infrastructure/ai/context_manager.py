from __future__ import annotations

from collections.abc import Callable

from app.domain.ports.ai_provider import Message

# Context window sizes (tokens) for every model the fallback chains / MODEL_ROUTER.md §7 name.
# Unlisted models fall back to CONTEXT_WINDOWS_DEFAULT rather than raising — a new model showing
# up in a fallback chain shouldn't break truncation, just get a conservative budget.
CONTEXT_WINDOWS: dict[str, int] = {
    "deepseek-r1:7b": 32_768,
    "deepseek-r1:14b": 32_768,
    "deepseek-r1:32b": 32_768,
    "deepseek-coder:1.3b": 16_384,
    "deepseek-coder:6.7b": 16_384,
    "qwen2.5:72b": 128_000,
    "qwen2.5-coder:1.5b": 32_768,
    "llama3.3:70b": 128_000,
    "mistral:7b": 32_768,
    "nomic-embed-text": 8_192,
    "claude-haiku-4-5": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-opus-4-8": 200_000,
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "text-embedding-3-small": 8_191,
    "gemini-2.0-flash": 1_048_576,
}
CONTEXT_WINDOW_DEFAULT = 8_192

# Truncation kicks in once usage crosses this fraction of the window, leaving headroom for the
# response itself (max_tokens) rather than cutting it exactly at the wire.
TRUNCATION_THRESHOLD = 0.9

TRUNCATION_MARKER = "[Context truncated. Earlier messages omitted.]"


def get_context_window(model: str) -> int:
    return CONTEXT_WINDOWS.get(model, CONTEXT_WINDOW_DEFAULT)


def truncate_messages(
    messages: list[Message],
    model: str,
    count_tokens: Callable[[list[Message]], int],
) -> list[Message]:
    """Preserves the system message (if any) and the last user message unconditionally, then
    drops the oldest remaining messages one at a time until the transcript fits within
    `TRUNCATION_THRESHOLD` of the model's context window. A `[Context truncated]` marker is
    inserted so the model (and any UI reading the transcript) knows history is missing, per
    MODEL_ROUTER.md §7."""
    budget = int(get_context_window(model) * TRUNCATION_THRESHOLD)
    if count_tokens(messages) <= budget:
        return messages

    system_messages = [m for m in messages if m.role == "system"]
    rest = [m for m in messages if m.role != "system"]
    if not rest:
        return messages

    last_user_index = max((i for i, m in enumerate(rest) if m.role == "user"), default=len(rest) - 1)
    tail = rest[last_user_index:]
    middle = rest[:last_user_index]

    marker = Message(role="system", content=TRUNCATION_MARKER)
    while middle and count_tokens([*system_messages, marker, *middle, *tail]) > budget:
        middle.pop(0)

    return [*system_messages, marker, *middle, *tail]
