# apps/desktop/src/features/chat/

AI chat interface with real-time streaming, context file attachment, model selection, and session history.

## Files (to be created in Phase 10)

| File | Purpose |
|---|---|
| `ChatPanel.tsx` | Root panel: session list + active session |
| `ChatSessionList.tsx` | Sidebar list of past chat sessions |
| `ChatMessageList.tsx` | Virtualized message list (`react-virtual`) |
| `ChatMessage.tsx` | Single message: markdown rendering, code block highlighting |
| `StreamingMessage.tsx` | Assembles incoming `stream_chunk` WebSocket events into a live message |
| `ChatInput.tsx` | Textarea with send button, file attach, model selector |
| `ModelSelector.tsx` | Dropdown of available models from `/api/v1/models` |
| `ContextFileChip.tsx` | Shows an attached file; removable |
| `useChat.ts` | Hook: sends messages, manages streaming state, handles file attachment |

## Streaming Architecture

1. User sends message → `POST /api/v1/chat/sessions/{id}/messages`
2. Backend triggers streaming and publishes `stream_chunk` events to Redis
3. WebSocket delivers events to `ws-client.ts`
4. `ws-client.ts` dispatches to `chat-slice.ts`
5. `StreamingMessage.tsx` reads slice state and renders appended tokens

Token batching: updates are flushed at most every 16ms to prevent per-token re-renders.
