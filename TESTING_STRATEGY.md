# Testing Strategy — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

Testing is not an afterthought — it is part of every phase. The strategy follows a pyramid: many fast unit tests, a solid layer of integration tests, and targeted end-to-end tests for critical user flows. Coverage targets are enforced in CI.

---

## 2. Test Pyramid

```
        ▲
       /E\     End-to-End (Playwright Electron)
      /   \    → Critical user flows only (~20 tests)
     /─────\
    / Integ \  Integration Tests
   /─────────\ → API, DB, AI service contracts (~150 tests)
  /───────────\
 /    Unit     \ Unit Tests
/───────────────\ → Pure functions, services, hooks (~500 tests)
```

---

## 3. Coverage Targets

| Area | Target | Enforced |
|---|---|---|
| Backend (Python) | 85% | CI fails below |
| Frontend (TypeScript) | 80% | CI fails below |
| Agent tools | 90% | CI fails below |
| E2E critical paths | 100% of defined flows | CI fails if test missing |

---

## 4. Backend Testing

### 4.1 Unit Tests (pytest)

Test location: `apps/backend/tests/unit/`

Tools: `pytest`, `pytest-asyncio`, `pytest-mock`, `freezegun`

Rules:
- No real DB, Redis, or network calls.
- All dependencies injected and mocked.
- Each test function is independent (no shared state).
- Use `anyio` backend for async tests.

```python
# tests/unit/test_context_builder.py

@pytest.mark.anyio
async def test_context_builder_truncates_at_limit(mock_tokenizer):
    messages = [Message("user", "x" * 1000)] * 100
    builder = ContextBuilder(max_tokens=4096, tokenizer=mock_tokenizer)
    
    result = await builder.build(messages, query="test")
    
    assert mock_tokenizer.count(result) <= 4096
    assert result[-1].role == "user"   # last user message always preserved
```

### 4.2 Integration Tests (pytest + TestClient)

Test location: `apps/backend/tests/integration/`

Tools: `httpx.AsyncClient`, `pytest-asyncio`, `testcontainers` (PostgreSQL + Redis in Docker)

Setup:
```python
# conftest.py
@pytest_asyncio.fixture(scope="session")
async def db():
    # Start PostgreSQL container, run migrations
    container = PostgresContainer("postgres:16")
    container.start()
    engine = create_async_engine(container.get_connection_url())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    container.stop()

@pytest_asyncio.fixture
async def client(db, redis):
    app = create_app()
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c
```

Example:
```python
@pytest.mark.anyio
async def test_send_message_streams_response(client, auth_headers, mock_model_router):
    mock_model_router.complete.return_value = async_chunks(["Hello", " world"])
    
    session = await create_chat_session(client, auth_headers)
    
    response = await client.post(
        f"/api/v1/chat/sessions/{session['id']}/messages",
        json={"content": "Hi"},
        headers=auth_headers,
    )
    
    assert response.status_code == 200
    chunks = [json.loads(line[6:]) for line in response.text.split("\n\n") if line.startswith("data:")]
    assert any(c["type"] == "stream_end" for c in chunks)
```

### 4.3 AI Service Contract Tests

These tests run against the real Ollama instance (when available) to verify the model router contracts hold:

```python
@pytest.mark.skipif(not ollama_available(), reason="Ollama not running")
@pytest.mark.anyio
async def test_ollama_provider_streams_chunks(ollama_provider):
    chunks = []
    async for chunk in await ollama_provider.complete(
        messages=[Message("user", "Say hello")],
        model="deepseek-r1:7b",
        stream=True,
    ):
        chunks.append(chunk)
    
    assert len(chunks) > 0
    assert any(c.finish_reason == "stop" for c in chunks)
```

---

## 5. Frontend Testing

### 5.1 Unit Tests (Vitest)

Test location: `apps/desktop/src/**/*.test.ts(x)`

Tools: `vitest`, `@testing-library/react`, `msw` (mock service worker for API)

Rules:
- No real IPC calls (mocked via `vi.mock('../../services/ipc.client')`).
- No real WebSocket (mocked).
- Snapshot tests only for stable UI components.

```typescript
// components/chat/MessageBubble.test.tsx
describe('MessageBubble', () => {
  it('renders markdown in assistant messages', () => {
    render(<MessageBubble message={assistantMessage('## Hello\n\nWorld')} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Hello');
  });

  it('shows streaming indicator when streaming', () => {
    render(<MessageBubble message={streamingMessage()} />);
    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
  });
});
```

### 5.2 Hook Tests

```typescript
// hooks/useChat.test.ts
describe('useChat', () => {
  it('appends stream chunks to the last message', async () => {
    const { result } = renderHook(() => useChat('session-123'));
    
    act(() => result.current.handleStreamChunk({ delta: 'Hello ' }));
    act(() => result.current.handleStreamChunk({ delta: 'world' }));
    
    expect(result.current.messages.at(-1)?.content).toBe('Hello world');
  });
});
```

### 5.3 Store Tests

```typescript
// store/editor.store.test.ts
describe('editorStore', () => {
  it('marks file dirty on content change', () => {
    const store = createEditorStore();
    store.openFile({ id: 'f1', path: '/src/main.ts', content: 'old' });
    store.setContent('f1', 'new');
    expect(store.dirtyFileIds.has('f1')).toBe(true);
  });
});
```

---

## 6. End-to-End Tests

### 6.1 Playwright Electron Tests

Test location: `apps/desktop/tests/e2e/`

Tools: `@playwright/test`, `playwright` Electron integration

Setup:
```typescript
// playwright.config.ts
const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  use: {
    browserName: 'chromium',
  },
};

// fixtures/electron.ts
export const electronTest = test.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({ args: ['.'] });
    await use(app);
    await app.close();
  },
});
```

### 6.2 Critical E2E Flows

| Flow | Test File |
|---|---|
| Open a workspace folder | `workspace.spec.ts` |
| Open a file and edit it | `editor.spec.ts` |
| Send a chat message and receive a response | `chat.spec.ts` |
| Start an agent task and approve an action | `agent.spec.ts` |
| Stage and commit a file | `git.spec.ts` |
| Open terminal and run a command | `terminal.spec.ts` |
| Install and activate a plugin | `plugins.spec.ts` |
| Change theme in settings | `settings.spec.ts` |

Example:
```typescript
// tests/e2e/chat.spec.ts
electronTest('sends a message and receives a streaming response', async ({ electronApp }) => {
  const page = await electronApp.firstWindow();
  
  await page.getByTestId('chat-input').fill('What does auth.ts do?');
  await page.keyboard.press('Enter');
  
  // Wait for streaming to complete
  await expect(page.getByTestId('streaming-indicator')).toBeVisible();
  await expect(page.getByTestId('streaming-indicator')).toBeHidden({ timeout: 30_000 });
  
  // Message appeared
  const lastMessage = page.getByTestId('message-bubble').last();
  await expect(lastMessage).toContainText('authentication');
});
```

---

## 7. Test Data Factories

```python
# tests/factories.py (backend)
def make_user(**overrides) -> User:
    return User(
        id=uuid4(),
        email=f"user-{uuid4().hex[:8]}@test.com",
        name="Test User",
        hashed_password=bcrypt.hash("password"),
        **overrides,
    )

def make_workspace(user_id: UUID, **overrides) -> Workspace:
    return Workspace(
        id=uuid4(),
        user_id=user_id,
        name="test-workspace",
        root_path="/tmp/test-workspace",
        **overrides,
    )
```

---

## 8. CI Pipeline

```yaml
# .github/workflows/test.yml

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: test }
      redis:
        image: redis:7
    steps:
      - run: pip install -e ".[test]"
      - run: pytest --cov=app --cov-fail-under=85 --cov-report=xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm install
      - run: pnpm vitest run --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm install && pnpm build:electron
      - run: pnpm playwright test
```

---

## 9. Test Naming Conventions

Backend: `test_{thing_being_tested}_{scenario}_{expected_result}`
```python
def test_jwt_verify_expired_token_raises_auth_error():
def test_model_router_ollama_unavailable_falls_back_to_cloud():
```

Frontend: `describe(Component) > it(behaviour)`
```typescript
describe('ChatInput') > it('disables send button while streaming')
```

---

## 10. Mocking Strategy

| Boundary | Mock Tool |
|---|---|
| AI model providers | `pytest-mock` / `vi.mock` on ModelProvider |
| PostgreSQL | `testcontainers` (real DB, not mocked) |
| Redis | `fakeredis` in unit tests; `testcontainers` in integration |
| Electron IPC | `vi.mock` on `ipc.client.ts` |
| WebSocket | Custom `MockWSClient` class |
| File system | `tmp_path` (pytest) / `memfs` (vitest) |
| Playwright browser | Real Playwright in E2E; `Mock` in unit |

**Rule:** Use real infrastructure (DB, Redis) in integration tests. Never mock the database in integration tests — use testcontainers.
