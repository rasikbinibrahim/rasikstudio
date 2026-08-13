# RAG System — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

**Implementation status (2026-08-11):** the indexing pipeline (§2–§3, §7, §11) and semantic search
(§4, as `search_semantic`, `apps/backend/app/agents/tools/search_tools.py`) are real — see
`apps/backend/app/infrastructure/rag/indexer.py`, `apps/backend/app/domain/services/chunker.py`,
`apps/backend/app/tasks/indexing_tasks.py`. The code samples below are illustrative design, not a
literal transcript of the real files (real names/signatures differ in places — e.g. the real
`CodeEmbeddingModel`, not a bare `CodeEmbedding` SQLAlchemy model); treat them as intent, and the
real source as ground truth where the two disagree. Real deviations worth calling out:

- **§3.3 Chunking**: only the "Fallback: fixed-size chunks" strategy is built. Tree-sitter
  AST-aware chunking (`chunk_by_ast`) is not — a real, tracked follow-up (`TASKS.md`), not a
  silently dropped requirement. No "chunk header" (file path + parent context prefix) is
  prepended to chunk content either; `file_path`/`language`/`start_line`/`end_line` are stored as
  separate columns instead, and `context_builder.py`'s RAG context injection already includes the
  file path when assembling the AI-visible context, so the same information reaches the model
  without duplicating it into the stored chunk text itself.
- **§3.1 Trigger Conditions / §7 Incremental Updates**: only "workspace opened, triggered
  explicitly" exists (`POST /workspaces/{id}/index`) — there's no file-watcher-triggered indexing
  on save/add/delete (no `chokidar`-equivalent backend infrastructure exists; see
  `apps/backend/app/application/workspaces/README.md`), and no automatic trigger when a workspace
  is opened either. As of 2026-08-12, "triggered explicitly" is reachable from the desktop app
  itself — an "Index" button in `FileExplorer.tsx`'s header (`services/indexing-client.ts`,
  `workspace-slice.ts`'s `startIndexing()`), not just a raw HTTP call — closing what was previously
  the whole feature's real usability gap (the pipeline existed but nothing in the shipped app could
  reach it). A full index run *is* incremental in effect (skips embedding any chunk whose SHA-256
  content hash is unchanged since the last run), just not triggered incrementally.
- **§6 Index Progress Tracking**: `index_progress` events publish over the real WebSocket gateway
  (workspace-wide), but nothing writes the `index:progress:{workspace_id}` Redis key this section
  describes — no code currently reads it back, so it was never built. As of 2026-08-12, the
  desktop app does consume the real WebSocket event directly (`useAiEventBridge.ts` →
  `workspace-slice.ts`'s `handleIndexProgress()` → inline `files_done`/`files_total` progress text
  next to the Index button) — the Redis key itself remains unwritten/unused, since the WS event
  alone is sufficient for the one consumer that exists.

---

## 1. Overview

The Retrieval-Augmented Generation (RAG) system indexes the workspace codebase into a vector store so that AI chat and agents can semantically search for relevant code. This eliminates the need to send the entire codebase as context (which would be impossible for large projects) while ensuring the AI has access to the most relevant information for any query.

---

## 2. Architecture

```
Workspace Files
      │
      ▼
File Watcher (chokidar)
      │ (on change)
      ▼
Indexing Queue (Redis)
      │
      ▼
Indexing Worker (Celery)
  ├── Read file
  ├── Detect language
  ├── Split into chunks
  ├── Compute SHA-256 hash
  ├── Skip if hash unchanged (incremental)
  └── Embed with nomic-embed-text (Ollama)
      │
      ▼
pgvector (PostgreSQL)
  table: code_embeddings
      │
      ▼
Semantic Search at query time
  → ANN search (HNSW index)
  → Return top-K chunks
  → Inject into AI context
```

---

## 3. Indexing Pipeline

### 3.1 Trigger Conditions

| Trigger | Debounce |
|---|---|
| Workspace opened (first time) | Immediate |
| Workspace opened (subsequent) | Only re-index changed files |
| File saved | 5 seconds |
| File added | 5 seconds |
| File deleted | Immediate (remove embeddings) |

### 3.2 File Filtering

Before indexing, files are filtered:

**Included:**
- Source code files (`.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.go`, `.rs`, `.java`, `.rb`, `.cs`, `.cpp`, `.c`, `.h`, `.swift`, `.kt`, `.php`, `.html`, `.css`, `.scss`, `.sql`, `.yaml`, `.json`, `.toml`, `.md`)
- Max file size: 500KB (larger files are partially indexed — first 10K characters)

**Excluded:**
- `.git/`, `node_modules/`, `__pycache__/`, `dist/`, `build/`, `.next/`, `target/`
- Binary files (detected by MIME type or extension)
- Files matching `.rasik/ignore` patterns
- Files matching `.gitignore` patterns

### 3.3 Chunking Strategy

```python
def chunk_file(content: str, language: str, file_path: str) -> list[Chunk]:
    """
    Split file content into overlapping chunks for embedding.
    
    Strategy:
    - For code files: chunk by top-level declarations (functions, classes)
      using tree-sitter AST parsing where available.
    - Fallback: fixed-size chunks of 512 tokens with 64-token overlap.
    - Each chunk includes a "header" (file path + parent class/function context).
    """
    if language in TREE_SITTER_LANGUAGES:
        return chunk_by_ast(content, language, file_path)
    return chunk_fixed_size(content, chunk_size=512, overlap=64, file_path=file_path)
```

**Chunk header format:**
```
# File: src/auth/jwt.py
# Context: class JWTService

def create_access_token(self, user_id: UUID, expires_delta: timedelta) -> str:
    ...
```

The header ensures that when a chunk is retrieved in isolation, the AI still understands its context.

### 3.4 Embedding

```python
async def embed_chunk(text: str) -> list[float]:
    """
    Embed using nomic-embed-text via Ollama.
    Falls back to text-embedding-3-small (OpenAI) if local model unavailable.
    """
    try:
        response = await ollama_client.embed(
            model="nomic-embed-text",
            input=text,
        )
        return response.embeddings[0]    # 768-dimensional float vector
    except OllamaUnavailableError:
        return await openai_client.embed(text, model="text-embedding-3-small")
```

### 3.5 Storage

```python
async def upsert_chunk(db: AsyncSession, chunk: Chunk, embedding: list[float]):
    """
    Insert or update a chunk. Uses content_hash for deduplication.
    """
    stmt = pg_insert(CodeEmbedding).values(
        workspace_id=chunk.workspace_id,
        file_path=chunk.file_path,
        chunk_index=chunk.index,
        content=chunk.content,
        embedding=embedding,
        language=chunk.language,
        start_line=chunk.start_line,
        end_line=chunk.end_line,
        content_hash=chunk.content_hash,
    ).on_conflict_do_update(
        index_elements=["workspace_id", "file_path", "chunk_index"],
        set_={"content": chunk.content, "embedding": embedding, "content_hash": chunk.content_hash},
        where=CodeEmbedding.content_hash != chunk.content_hash,  # skip if unchanged
    )
    await db.execute(stmt)
```

---

## 4. Semantic Search

```python
async def search_codebase(
    db: AsyncSession,
    workspace_id: UUID,
    query: str,
    top_k: int = 5,
    language_filter: list[str] | None = None,
    file_path_filter: str | None = None,
) -> list[SearchResult]:
    query_embedding = await embed_chunk(query)
    
    stmt = (
        select(
            CodeEmbedding,
            CodeEmbedding.embedding.cosine_distance(query_embedding).label("distance"),
        )
        .where(CodeEmbedding.workspace_id == workspace_id)
        .order_by("distance")
        .limit(top_k)
    )
    
    if language_filter:
        stmt = stmt.where(CodeEmbedding.language.in_(language_filter))
    if file_path_filter:
        stmt = stmt.where(CodeEmbedding.file_path.like(f"{file_path_filter}%"))
    
    rows = await db.execute(stmt)
    return [
        SearchResult(
            file_path=row.file_path,
            start_line=row.start_line,
            end_line=row.end_line,
            content=row.content,
            score=1 - row.distance,    # cosine similarity (0-1)
            language=row.language,
        )
        for row in rows
    ]
```

---

## 5. Context Injection

When building the AI context window, RAG results are injected:

```python
def build_rag_context(results: list[SearchResult]) -> str:
    if not results:
        return ""
    
    parts = ["## Relevant code from workspace:\n"]
    for r in results:
        parts.append(f"### {r.file_path} (lines {r.start_line}-{r.end_line})")
        parts.append(f"```{r.language}")
        parts.append(r.content)
        parts.append("```\n")
    
    return "\n".join(parts)
```

The RAG context is placed between the workspace metadata and the conversation history in the system prompt.

---

## 6. Index Progress Tracking

During indexing, progress is emitted over WebSocket:

```python
await redis.set(f"index:progress:{workspace_id}", json.dumps({
    "files_done": done,
    "files_total": total,
    "current_file": current_file,
    "started_at": started_at.isoformat(),
}), ex=600)

await ws_manager.broadcast(str(workspace_id), {
    "type": "index_progress",
    "files_done": done,
    "files_total": total,
    "current_file": current_file,
})
```

The status bar shows a progress indicator during indexing.

---

## 7. Incremental Updates

To avoid re-indexing unchanged files on every open:

```python
async def get_files_needing_indexing(workspace_root: Path) -> list[Path]:
    all_files = list_indexable_files(workspace_root)
    current_hashes = {f: sha256(f.read_bytes()).hexdigest() for f in all_files}
    
    stored_hashes = await db.execute(
        select(CodeEmbedding.file_path, CodeEmbedding.content_hash)
        .where(CodeEmbedding.workspace_id == workspace_id)
        .distinct(CodeEmbedding.file_path)
    )
    stored = {row.file_path: row.content_hash for row in stored_hashes}
    
    return [
        f for f in all_files
        if str(f.relative_to(workspace_root)) not in stored
        or stored[str(f.relative_to(workspace_root))] != current_hashes[f]
    ]
```

---

## 8. Re-indexing on File Delete

```python
async def on_file_deleted(workspace_id: UUID, file_path: str, db: AsyncSession):
    await db.execute(
        delete(CodeEmbedding)
        .where(CodeEmbedding.workspace_id == workspace_id)
        .where(CodeEmbedding.file_path == file_path)
    )
    await db.commit()
```

---

## 9. Performance Targets

| Metric | Target |
|---|---|
| Initial index time (1K files) | < 60 seconds |
| Incremental re-index (1 file) | < 2 seconds |
| Semantic search latency (1M vectors) | < 100ms |
| Embedding throughput | ~50 chunks/sec (local GPU) / ~200 chunks/sec (CPU with batch) |

---

## 10. Model Specs

| Model | Dimensions | Max Input Tokens | Notes |
|---|---|---|---|
| `nomic-embed-text` | 768 | 8192 | Default local model via Ollama |
| `text-embedding-3-small` | 1536 | 8192 | OpenAI cloud fallback |
| `text-embedding-3-large` | 3072 | 8192 | Higher quality, higher cost |

The HNSW index in pgvector is configured for the default 768-dimensional model. Changing the embedding model requires deleting all embeddings and re-indexing.

---

## 11. Workspace Index Cleanup

When a workspace is deleted, all embeddings are deleted via CASCADE in PostgreSQL:

```sql
-- workspaces.id → code_embeddings.workspace_id (ON DELETE CASCADE)
DELETE FROM workspaces WHERE id = $1;
-- Automatically deletes all related code_embeddings rows.
```
