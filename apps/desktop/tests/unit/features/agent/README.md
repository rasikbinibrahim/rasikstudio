# apps/desktop/tests/unit/features/agent/

Unit tests for the agent task panel and approval gate UI.

Key scenarios to cover:
- `agent_step` events render new step rows in the task detail view
- `agent_approval_required` event opens the approval gate modal
- Clicking Approve calls `POST /api/v1/agents/{id}/approve` with `approved: true`
- Clicking Deny calls the endpoint with `approved: false`
- Task status transitions are reflected correctly in the task list
- Agent browser screenshot events render the image in `AgentBrowserView`
