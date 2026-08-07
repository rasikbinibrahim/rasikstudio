from __future__ import annotations

import structlog
import tiktoken
from tokenizers import Tokenizer

logger = structlog.get_logger("ai.tokenizer_registry")

# Maps an Ollama model family (as reported by `GET /api/show`'s `details.family`, e.g. "qwen2")
# to a Hugging Face repo whose `tokenizer.json` matches that family closely enough for accurate
# counting. Chosen from ungated repos only — a gated repo (e.g. meta-llama/*) would make token
# counting depend on an `HF_TOKEN` this deployment may not have, which is a much worse failure
# mode than the tiktoken fallback below.
_FAMILY_TOKENIZER_REPOS: dict[str, str] = {
    "qwen2": "Qwen/Qwen2.5-7B-Instruct",
    "llama": "NousResearch/Meta-Llama-3.1-8B-Instruct",
    "mistral": "mistralai/Mistral-7B-Instruct-v0.3",
    "deepseek2": "deepseek-ai/DeepSeek-R1",
}

_hf_tokenizer_cache: dict[str, Tokenizer | None] = {}
_TIKTOKEN_FALLBACK = tiktoken.get_encoding("cl100k_base")


def load_hf_tokenizer(family: str) -> Tokenizer | None:
    """Returns a cached Hugging Face `Tokenizer` for the given Ollama model family, or `None` if
    the family is unmapped or the repo can't be fetched (no network, repo renamed, etc.) — callers
    must fall back to `count_tokens_approx` in that case rather than treat it as fatal, since
    token counting only feeds truncation heuristics, not the actual request sent to the model."""
    if family in _hf_tokenizer_cache:
        return _hf_tokenizer_cache[family]

    repo_id = _FAMILY_TOKENIZER_REPOS.get(family)
    if repo_id is None:
        _hf_tokenizer_cache[family] = None
        return None

    try:
        tokenizer = Tokenizer.from_pretrained(repo_id)
    except Exception:
        logger.warning("tokenizer_fetch_failed", family=family, repo_id=repo_id)
        tokenizer = None

    _hf_tokenizer_cache[family] = tokenizer
    return tokenizer


def count_tokens_approx(text: str) -> int:
    """cl100k_base approximation — used when no model-specific tokenizer is available. Not exact
    for non-OpenAI models, but close enough to drive truncation decisions safely."""
    return len(_TIKTOKEN_FALLBACK.encode(text))
