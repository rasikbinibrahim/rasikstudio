# apps/desktop/tests/unit/features/chat/

Unit tests for the AI chat feature.

Key scenarios to cover:
- Sending a message calls the correct API endpoint
- `stream_chunk` events are appended to the current message
- `stream_end` event marks the message as complete
- Model selector shows available models and updates the active model
- File attachment adds a context file chip to the input
- Session list renders all sessions from the store
