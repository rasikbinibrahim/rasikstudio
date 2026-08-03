# apps/desktop/tests/unit/features/editor/

Unit tests for Monaco editor integration, tab management, and LSP client.

Key scenarios to cover:
- Opening a file sets the correct Monaco model
- Switching tabs preserves cursor position and scroll state
- Dirty state is set on edit, cleared on save
- LSP diagnostics are shown as error squiggles (mock LSP connection)
- Monaco web worker URL is configured correctly
