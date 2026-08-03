# apps/desktop/tests/e2e/fixtures/

Static fixtures for end-to-end tests: sample workspaces, mock backend responses, and test credentials.

## Contents (to be created in Phase 16)

| Item | Purpose |
|---|---|
| `workspace-basic/` | A minimal workspace with 5 files across 2 languages for open/edit/save tests |
| `workspace-git/` | A git-initialized workspace with staged and unstaged changes pre-configured |
| `workspace-large/` | 500+ file workspace for performance tests |
| `mock-backend.ts` | MSW-based mock of the FastAPI backend for tests that don't require a real backend |
| `mock-ollama-responses/` | Recorded Ollama streaming responses for deterministic AI tests |

## Rules

- No real API keys or credentials in fixtures.
- Fixture workspaces are small — only what each test needs.
- Mock backend responses must match the actual API schema exactly (validated against the OpenAPI spec).
