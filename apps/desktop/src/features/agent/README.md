# apps/desktop/src/features/agent/

Agent task panel: shows running agent tasks, step-by-step progress, tool call details, and the human approval gate UI.

## Files (to be created in Phase 8)

| File | Purpose |
|---|---|
| `AgentPanel.tsx` | Root panel: task list + active task detail |
| `AgentTaskList.tsx` | List of all tasks (running, completed, failed) |
| `AgentTaskDetail.tsx` | Step-by-step log for the active task |
| `AgentStep.tsx` | Single step: tool name, args summary, result, status icon |
| `AgentApprovalGate.tsx` | Modal shown when agent requests human approval for a high-risk action |
| `AgentBrowserView.tsx` | Renders screenshots streamed from the Playwright agent browser |
| `NewTaskDialog.tsx` | Dialog to describe and submit a new agent task |
| `useAgent.ts` | Hook: subscribes to `agent_step` and `agent_approval_required` WS events |

## Approval Gate Flow

1. `agent_approval_required` event arrives via WebSocket
2. `AgentApprovalGate.tsx` renders as a modal with tool name, args, and risk level
3. User clicks Approve or Deny
4. Frontend calls `POST /api/v1/agents/{id}/approve`
5. Task resumes (or is cancelled)

The task status in `agent-slice.ts` transitions to `paused` while the gate is showing, blocking any further step rendering.
