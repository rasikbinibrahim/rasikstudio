# Performance Guide — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| App startup (cold) | < 2s to interactive | Time to first editor focus |
| App startup (warm) | < 1s to interactive | With V8 bytecode cache |
| File open | < 100ms | From click to editor ready |
| Editor keystrokes | < 16ms (60fps) | Input latency |
| AI first token (local) | < 500ms | Model warm; first chunk |
| AI first token (cloud) | < 1500ms | Network + TTFT |
| Terminal input lag | < 10ms | Keystroke to echo |
| File tree expand (1K nodes) | < 50ms | Click to render |
| Semantic search | < 300ms | Query to results in UI |
| Backend API p99 | < 200ms | Excluding AI calls |

---

## 2. Desktop Performance

### 2.1 Startup Optimization

**Problem:** Electron app startup can be slow due to large bundle size.

**Solutions:**

1. **V8 bytecode cache** — pre-compile JS on first run, load cached bytecode on subsequent runs.
   ```typescript
   // electron/main.ts
   app.on('ready', () => {
     protocol.handle('app', (request) => {
       // Serve renderer files; V8 cache is managed automatically by Electron
     });
   });
   ```

2. **Lazy module loading** — don't import Monaco, xterm.js, or Playwright until needed.
   ```typescript
   // Instead of top-level import
   const monaco = await import('monaco-editor');
   ```

3. **Defer non-critical initialization** — start file watcher, RAG index check, and auto-updater check after the editor is visible.

4. **Window show timing** — show the window only after the React tree is painted:
   ```typescript
   win.once('ready-to-show', () => win.show());
   ```

### 2.2 Renderer Performance

**Monaco Editor:**
- Use Web Workers for language services (TypeScript, JSON, CSS) to avoid blocking the main thread.
- Disable features not in use (minimap, outline) via settings to reduce render work.
- Reuse editor instances across file switches (update model, don't destroy/recreate).

**File Tree:**
- `react-virtual` for virtualized rendering — only DOM nodes for visible rows.
- Lazy expand: load children on first open only.
- Debounce file watcher updates: coalesce rapid file changes into a single re-render.

**Chat Message List:**
- Virtualized list with `react-virtual`.
- Stream chunks are batched before applying to state: flush at most every 16ms.
- Code blocks in messages are syntax-highlighted lazily (on scroll into view).

### 2.3 IPC Performance

IPC calls between renderer and main process have ~1-2ms overhead. Minimize round trips:

- Batch file reads: `ipc.invoke('files:readMany', [path1, path2, ...])` instead of multiple calls.
- Cache frequently read files (settings, workspace config) in renderer memory.
- Use streaming for large outputs (file content >100KB, shell output) instead of single large payloads.

### 2.4 Terminal Performance

- Use xterm.js **WebGL renderer** — hardware-accelerated; 10x faster than DOM renderer.
- Batch PTY output: node-pty delivers data events; throttle to 60fps before forwarding to renderer.
- Limit scrollback buffer (10K lines) to prevent unbounded memory growth.

---

## 3. Backend Performance

### 3.1 Async Everywhere

All I/O must be async. No synchronous blocking calls in request handlers:

```python
# WRONG — blocks event loop
with open(file_path) as f:
    content = f.read()

# CORRECT — async file I/O
async with aiofiles.open(file_path) as f:
    content = await f.read()
```

```python
# WRONG — sync DB call
session.execute(select(User).where(...))

# CORRECT — async DB call
await session.execute(select(User).where(...))
```

### 3.2 Database Query Optimization

- **N+1 prevention:** Use `selectinload` or `joinedload` for related models.
  ```python
  stmt = select(ChatSession).options(selectinload(ChatSession.messages)).where(...)
  ```
- **Index coverage:** Verify all `WHERE` clause columns have indexes. Run `EXPLAIN ANALYZE` on slow queries.
- **Pagination:** All list endpoints use keyset pagination (cursor), not offset-based.
- **Connection pool:** Set `pool_size=10`, `max_overflow=20` for 30 concurrent users.

### 3.3 AI Response Streaming

Never buffer the full AI response before sending to the client. Stream chunks immediately:

```python
async def stream_to_client(stream: AsyncIterator[StreamChunk]) -> AsyncGenerator:
    async for chunk in stream:
        if chunk.delta:
            yield f"data: {json.dumps({'type': 'stream_chunk', 'delta': chunk.delta})}\n\n"
    yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
```

First-token latency is more important than total latency. The user sees progress immediately.

### 3.4 Caching Strategy

```
Caching layers (fastest to slowest):

1. In-process LRU cache (functools.lru_cache / cachetools)
   → Use for: settings, model context windows, tokenizer instances
   → TTL: process lifetime

2. Redis (shared across workers)
   → Use for: model availability flags, non-streaming AI responses (1h), rate limit counters
   → TTL: per-key (see DATABASE_DESIGN.md)

3. PostgreSQL materialized views (future)
   → Use for: aggregate statistics, workspace summaries
```

### 3.5 Celery Worker Tuning

```python
# apps/backend/app/worker.py
celery_app = Celery(
    'rasik',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    task_soft_time_limit=240,   # send SIGUSR1 at 4 min
    task_time_limit=300,        # send SIGKILL at 5 min
    worker_prefetch_multiplier=1,   # one task at a time per worker (for long AI tasks)
    task_acks_late=True,            # only ack after task completes (survive crashes)
)
```

---

## 4. AI Performance

### 4.1 Local Model Warm-Up

Ollama keeps models in VRAM only when recently used. On workspace open, pre-warm the default model:

```python
async def warm_up_model(model: str):
    """Send a trivial request to load the model into VRAM."""
    await ollama_client.complete(
        messages=[Message("user", "Hi")],
        model=model,
        max_tokens=1,
    )
```

This moves first-token latency from 3-5s (model load) to <500ms (model already loaded).

### 4.2 Completion Model Selection

Inline completions must be <100ms to feel responsive. Use the smallest available coder model:

| Priority | Model | VRAM | Speed |
|---|---|---|---|
| 1 | qwen2.5-coder:1.5b | 1.5GB | ~50ms |
| 2 | deepseek-coder:1.3b | 1.3GB | ~60ms |
| 3 | qwen2.5-coder:7b | 5GB | ~200ms |

Use a 200ms debounce on the completion trigger — don't call the model on every keystroke.

### 4.3 Completion Caching

Cache recent completions by (file_path, cursor_line, prefix hash):

```python
completion_cache: dict[str, list[CompletionItem]] = {}

def cache_key(file_path: str, prefix: str) -> str:
    return hashlib.md5(f"{file_path}:{prefix[-100:]}".encode()).hexdigest()
```

TTL: 30 seconds. Clear on file edit.

### 4.4 RAG Search Optimization

- Run RAG search in parallel with the AI call (fire-and-forget, inject results if they arrive before context is finalized).
- Cache RAG results for identical queries within the same session (Redis, 5-minute TTL).
- Use HNSW `ef_search=40` for a good recall/speed balance at the pgvector query level.

---

## 5. Memory Management

### 5.1 Desktop (Electron)

| Component | Memory Budget | Notes |
|---|---|---|
| Electron main process | < 100MB | Node.js + IPC |
| Renderer (React + Monaco) | < 400MB | Monaco is large; limit open files to 20 |
| xterm.js (per tab) | ~10-20MB | With WebGL |
| Playwright (agent browser) | ~200MB | Only when agent is using browser |
| Total target | < 1GB | Under 4GB systems |

- Close Playwright browser after 30 minutes of inactivity.
- Release Monaco models when files are closed (`model.dispose()`).
- Limit terminal scrollback (default 10K lines, ~10MB).

### 5.2 Backend (Python)

- Use `asyncio` to handle concurrency without threads (lower memory per connection).
- Stream large files; never load >10MB into memory at once.
- Celery workers: set `worker_max_tasks_per_child=100` to restart workers periodically and release leaked memory.

---

## 6. Profiling Tools

| Environment | Tool | How |
|---|---|---|
| Desktop renderer | Chrome DevTools | Open with `Ctrl+Shift+I` in dev mode |
| Desktop main process | `--inspect=9229` flag | Attach Node.js DevTools |
| Backend (Python) | `py-spy` | `py-spy top --pid <pid>` |
| Backend (DB queries) | `EXPLAIN ANALYZE` | Run in psql or DBeaver |
| Backend (API) | `pyinstrument` middleware | Enable in `APP_ENV=development` |

---

## 7. Bundle Size Optimization

```bash
# Analyze renderer bundle
pnpm build:renderer --analyze

# Key targets:
# monaco-editor: ~5MB → lazy loaded
# xterm.js: ~300KB → acceptable
# react + zustand: ~200KB → acceptable
# Total initial bundle: < 500KB (without Monaco)
```

Code splitting strategy:
```typescript
// Lazy-load heavy panels
const GitPanel = lazy(() => import('./sidebar/GitPanel'));
const BrowserPanel = lazy(() => import('./panels/BrowserPanel'));
const AgentPanel = lazy(() => import('./panels/AgentPanel'));
```

---

## 8. Monitoring in Production

Key metrics to alert on:

| Metric | Warning | Critical |
|---|---|---|
| API p99 latency | > 500ms | > 2000ms |
| DB connection pool utilization | > 70% | > 90% |
| Redis memory usage | > 500MB | > 800MB |
| AI first-token latency | > 1000ms | > 3000ms |
| Celery queue depth | > 10 tasks | > 50 tasks |
| Worker memory per process | > 500MB | > 1GB |
