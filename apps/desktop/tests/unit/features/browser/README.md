# apps/desktop/tests/unit/features/browser/

Unit tests for the browser panel.

Key scenarios to cover:
- Address bar updates to reflect the current URL
- Navigate event calls the correct IPC handler
- `agent_browser_screenshot` WebSocket event renders the image in `AgentBrowserOverlay`
- Back/forward buttons are disabled when there is no history to navigate
