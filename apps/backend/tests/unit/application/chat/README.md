# apps/backend/tests/unit/application/chat/

Unit tests for chat use cases.

Key scenarios:
- `ContextBuilder`: assembles context in the correct order (system → workspace → RAG → history → user message)
- `ContextBuilder`: compresses history when token count approaches context window limit
- `SendMessageUseCase`: publishes `stream_chunk` events for each AI token
- `SendMessageUseCase`: saves completed message to repository after stream ends
- `MemoryExtractorUseCase`: classifies extracted facts into correct memory types
