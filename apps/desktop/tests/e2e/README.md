# apps/desktop/tests/e2e/

Playwright end-to-end tests that launch the full Electron application and drive it as a real user would.

## 8 Critical Flows (from TESTING_STRATEGY.md)

| File | Flow |
|---|---|
| `01-launch-and-open.test.ts` | App launch → workspace open → file edit → save |
| `02-ai-chat.test.ts` | Chat with local Ollama model, verify token streaming |
| `03-agent-task.test.ts` | Create agent task, step through, approve a high-risk action |
| `04-git-workflow.test.ts` | Stage changes → commit → verify with git log |
| `05-terminal.test.ts` | Open terminal, run command, verify output |
| `06-search-navigate.test.ts` | Ctrl+P file search, go-to-definition via LSP |
| `07-theme-settings.test.ts` | Switch theme, change a setting, verify persistence |
| `08-update-flow.test.ts` | Simulate auto-updater notification, verify UI response |

## Fixtures

Test workspaces and mock data live in `fixtures/`. E2E tests must not use production data or real cloud AI credentials.

## Running E2E Tests

```bash
pnpm test:e2e          # headless
pnpm test:e2e --headed # with visible window (debugging)
```

E2E tests require the backend to be running. Use the mock backend fixture for CI.
