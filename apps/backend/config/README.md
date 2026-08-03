# apps/backend/config/

Non-secret YAML configuration files. These files are committed to version control. Secrets (API keys, database passwords) never go here — they live in environment variables (`.env`).

## Files (to be created in Phase 9)

| File | Purpose |
|---|---|
| `fallback_chains.yaml` | AI model fallback sequences per feature type |
| `rate_limits.yaml` | Rate limit rules per endpoint group |
| `agent_guards.yaml` | Per-agent-type iteration, token, and timeout limits |

## fallback_chains.yaml Example

```yaml
chat:
  - deepseek-r1:7b
  - claude-sonnet-4-5
  - gpt-4o-mini

completion:
  - qwen2.5-coder:1.5b
  - deepseek-coder:1.3b

embedding:
  - nomic-embed-text
  - text-embedding-3-small
```

The `ModelRouter` reads this file at startup. When a model is unavailable, it automatically tries the next in the chain.
