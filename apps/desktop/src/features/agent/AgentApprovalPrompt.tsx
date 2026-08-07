import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

export interface AgentApprovalPromptProps {
  taskId: string
}

/** `AGENT_FRAMEWORK.md` §6's human approval gate, rendered — a High-risk tool call the agent
 *  wants to run, paused until this resolves. Denying doesn't cancel the task (see PROGRESS.md's
 *  Phase 8 entry): the agent gets "Action denied by user" as its tool result and re-plans. */
export function AgentApprovalPrompt({ taskId }: AgentApprovalPromptProps): JSX.Element | null {
  const pending = useAppStore((state) => state.agentPendingApproval[taskId])
  const approveAgentTask = useAppStore((state) => state.approveAgentTask)

  if (!pending) return null

  return (
    <div className="flex flex-col gap-2 border-t border-status-warning bg-bg-elevated p-3">
      <span className="text-xs font-semibold text-status-warning">Approval required</span>
      <span className="text-sm text-text-primary">{pending.action}</span>
      {pending.preview && (
        <pre className="overflow-x-auto rounded bg-bg-input p-2 text-xs text-text-secondary">
          {pending.preview}
        </pre>
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void approveAgentTask(taskId, true)}>
          Approve
        </Button>
        <Button variant="danger" size="sm" onClick={() => void approveAgentTask(taskId, false)}>
          Deny
        </Button>
      </div>
    </div>
  )
}
