# Phase 10 — AI Chat

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 3, Phase 7, Phase 9
**Estimated effort:** 3 weeks

---

## Objective

Build the full AI chat feature: chat session management, context building (workspace + files + RAG + conversation history), streaming responses through WebSocket, and the chat UI panel in the desktop. By the end of this phase, a user can have a real AI conversation about their code.

## Architecture

**Context building order (see `AI_ARCHITECTURE.md §4`):**
```
1. System prompt (role + workspace info)
2. Workspace context (active file, language, recent diagnostics)
3. RAG results (semantically relevant code chunks, retrieved via `EmbeddingService` +
   `EmbeddingRepository.search()` against `code_embeddings` — there is no separate "RAG phase" in
   the 18-phase roadmap, so this lives in Phase 10 itself; the stale "Phase 16 adds RAG" note this
   replaced was simply wrong, Phase 16 is Testing)
4. Conversation history (compressed if needed)
5. User message
```

**Streaming flow (unified WebSocket — ADR 0006):**
```
POST /api/v1/chat/sessions/{id}/messages
  → creates Message record, triggers streaming
  → each token published to the user's Redis channel:
      publish("ws:workspace:{id}:user:{uid}", {"type": "stream_chunk", "delta": "..."})
  → ConnectionManager delivers to desktop WebSocket
  → Desktop ws-client dispatches to chatSlice
  → ChatPanel appends token to current message
  → stream_end event: message saved, usage recorded
```

**Chat UI:**
- Message list (virtualized with react-virtual)
- Streaming tokens appended at 16ms max flush interval
- Code blocks syntax-highlighted lazily (on scroll into view)
- Markdown rendering for AI responses
- File attachment (drag file from tree → attached as context)
- Model selector (dropdown showing available models from Phase 9)

**Memory integration (see `MEMORY_SYSTEM.md`):**
- After session ends, extract and store workspace memories (background task)
- On next chat in same workspace, inject relevant memories into system prompt

## Dependencies

- Phase 7 complete (WebSocket event delivery)
- Phase 9 complete (ModelRouter)
- Phase 5 complete (chat_sessions, messages tables)
- Phase 3 desktop (React renderer)
- `react-markdown`, `rehype-highlight` (markdown rendering)
- `react-virtual` (message list virtualization)

## Files to Create

**Backend:**
- `app/application/chat/create_session.py` — `CreateChatSessionUseCase`
- `app/application/chat/send_message.py` — `SendMessageUseCase` (context builder + streaming trigger)
- `app/application/chat/context_builder.py` — assembles context from workspace, files, history
- `app/application/chat/memory_extractor.py` — post-session memory extraction background task
- `app/api/v1/chat.py` — session CRUD + send message endpoint

**Desktop:**
- `src/features/chat/ChatPanel.tsx` — main chat panel
- `src/features/chat/ChatMessageList.tsx` — virtualized message list
- `src/features/chat/ChatMessage.tsx` — single message (markdown, code blocks)
- `src/features/chat/ChatInput.tsx` — textarea, send button, file attach, model selector
- `src/features/chat/ChatSessionList.tsx` — session history sidebar
- `src/features/chat/StreamingMessage.tsx` — assembles incoming `stream_chunk` events
- `src/store/chat-slice.ts` — sessions, messages, streaming state

## Files to Modify

- `app/api/v1/__init__.py` — include chat router
- `src/layout/RightSidebar.tsx` (or BottomPanel) — mount ChatPanel
- `src/App.tsx` — connect chat slice to WebSocket event dispatcher

## Acceptance Criteria

- [ ] User can create a new chat session
- [ ] Sending a message streams the AI response token-by-token in the UI
- [ ] Streaming tokens are batched at max 16ms intervals (no per-token re-render)
- [ ] Long conversation history is correctly compressed when approaching context window
- [ ] Active file content is included in the AI context
- [ ] Dragging a file from the file tree into chat attaches it as context
- [ ] Model selector correctly changes which model handles the request
- [ ] Code blocks in AI responses are syntax-highlighted
- [ ] Chat history persists across app restarts (loaded from DB)
- [ ] `Ctrl+Shift+C` focuses the chat input
- [ ] Memory extraction runs after session ends and stores memories in DB

## Testing Strategy

- **Unit tests:** Context builder (correct ordering, compression), memory extractor, session CRUD
- **Integration tests:** Full chat flow with real Ollama (stream tokens, check DB persistence)
- **Desktop tests:** ChatPanel renders streaming messages correctly (mock WebSocket)
- **Performance:** Measure TTFT with local Ollama model. Target: < 500ms

## Estimated Effort

**3 weeks**
- Week 1: Backend — session/message CRUD, context builder, streaming trigger
- Week 2: Desktop — ChatPanel, streaming message assembly, model selector
- Week 3: Memory extraction, file attachment, keyboard navigation, tests
