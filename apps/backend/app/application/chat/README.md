# apps/backend/app/application/chat/

Chat session use cases.

## Files (to be created in Phase 10)

| File | Use Case | Description |
|---|---|---|
| `create_session.py` | `CreateChatSessionUseCase` | Create a new session record with workspace association |
| `send_message.py` | `SendMessageUseCase` | Build context, stream AI response, save message |
| `context_builder.py` | `ContextBuilder` | Assembles AI context: system prompt + workspace + RAG + history |
| `manage_session.py` | `ManageSessionUseCase` | List, get, delete sessions |
| `memory_extractor.py` | `MemoryExtractorUseCase` | Post-session LLM call to extract and store workspace memories |

## Context Building Order (from AI_ARCHITECTURE.md §4)

```
1. System prompt (role + workspace info)
2. Active file content
3. RAG results (semantically relevant code chunks)
4. Conversation history (compressed if near context window limit)
5. User message
```

The `ContextBuilder` is a stateless service — it can be tested independently of the streaming logic.
