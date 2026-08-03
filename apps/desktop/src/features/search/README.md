# apps/desktop/src/features/search/

Global search panel: semantic RAG search (finds code by meaning) and text grep search (finds code by exact pattern).

## Files (to be created in Phase 10)

| File | Purpose |
|---|---|
| `SearchPanel.tsx` | Root panel with mode toggle (semantic / text) and results |
| `SearchInput.tsx` | Query input with mode indicator |
| `SearchResults.tsx` | List of result groups (by file) |
| `SearchResultFile.tsx` | Single file group with matching excerpts |
| `SearchResultLine.tsx` | Single matching line with highlighted match |
| `useSearch.ts` | Hook: calls `POST /api/v1/search/semantic` or `GET /api/v1/search/grep` |

## Two Search Modes

| Mode | Backend Endpoint | How It Works |
|---|---|---|
| Semantic | `POST /api/v1/search/semantic` | pgvector HNSW cosine similarity on code embeddings |
| Text | `GET /api/v1/search/grep` | ripgrep or Python `re` on workspace files |

Semantic search requires the workspace to be RAG-indexed. An index status indicator is shown in the panel.
