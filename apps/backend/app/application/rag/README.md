# apps/backend/app/application/rag/

RAG (Retrieval-Augmented Generation) indexing and search use cases.

## Files (to be created in Phase 8)

| File | Use Case | Description |
|---|---|---|
| `index_file.py` | `IndexFileUseCase` | Read → detect language → chunk → hash → embed → upsert |
| `search_semantic.py` | `SemanticSearchUseCase` | Embed query, HNSW cosine search, return ranked results |
| `delete_file_index.py` | `DeleteFileIndexUseCase` | Remove all embeddings for a deleted file |
| `incremental_check.py` | `IncrementalIndexCheckUseCase` | Compare `(mtime, size)` before SHA-256 to skip unchanged files |

## Indexing Pipeline

```
chokidar event → Redis queue → Celery worker → IndexFileUseCase
                                              ├── tree-sitter chunk (if supported language)
                                              ├── fallback: 512-token fixed chunks
                                              ├── embed via EmbeddingService
                                              └── upsert to code_embeddings (by content_hash)
```

## Change Detection

Use `(mtime, size)` comparison first. Only compute SHA-256 for files where mtime/size changed. This reduces startup I/O from O(all file bytes) to near-zero for typical sessions. See Review Report §4.5.
