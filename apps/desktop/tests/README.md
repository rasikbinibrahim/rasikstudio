# apps/desktop/tests/

All test suites for the Rasik Studio desktop application.

## Structure

| Directory | Framework | Purpose |
|---|---|---|
| `unit/` | Vitest | Component rendering, hook behavior, store logic |
| `e2e/` | Playwright + Electron | Full application flows: launch, edit, commit, chat |

## Naming Convention

Test file paths mirror source file paths exactly:

```
src/features/chat/ChatPanel.tsx   →   tests/unit/features/chat/ChatPanel.test.tsx
src/hooks/useWebSocket.ts         →   tests/unit/hooks/useWebSocket.test.ts
src/store/chat-slice.ts           →   tests/unit/store/chat-slice.test.ts
```

## Coverage Targets

| Area | Target |
|---|---|
| Unit (overall) | ≥ 80% |
| Design system components | 100% (all variants, all states) |
| Zustand store slices | ≥ 90% |

Coverage is enforced in CI — a PR that drops below the threshold is blocked.
