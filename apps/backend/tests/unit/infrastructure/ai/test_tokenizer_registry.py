from __future__ import annotations

from app.infrastructure.ai import tokenizer_registry


class TestCountTokensApprox:
    def test_counts_tokens_using_cl100k_base(self) -> None:
        assert tokenizer_registry.count_tokens_approx("hello world") > 0

    def test_empty_string_counts_zero(self) -> None:
        assert tokenizer_registry.count_tokens_approx("") == 0


class TestLoadHfTokenizer:
    def test_returns_none_for_an_unmapped_family(self) -> None:
        assert tokenizer_registry.load_hf_tokenizer("some-unknown-family") is None

    def test_caches_the_none_result_for_an_unmapped_family(self) -> None:
        tokenizer_registry._hf_tokenizer_cache.pop("another-unknown-family", None)
        first = tokenizer_registry.load_hf_tokenizer("another-unknown-family")
        assert "another-unknown-family" in tokenizer_registry._hf_tokenizer_cache
        second = tokenizer_registry.load_hf_tokenizer("another-unknown-family")
        assert first is second is None

    def test_falls_back_to_none_when_the_repo_fetch_fails(self, monkeypatch) -> None:
        def raise_error(repo_id: str):
            raise OSError("no network")

        monkeypatch.setattr(tokenizer_registry.Tokenizer, "from_pretrained", staticmethod(raise_error))
        tokenizer_registry._hf_tokenizer_cache.pop("qwen2", None)

        result = tokenizer_registry.load_hf_tokenizer("qwen2")

        assert result is None
