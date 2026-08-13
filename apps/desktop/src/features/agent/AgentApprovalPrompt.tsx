import { useState } from 'react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

export interface AgentApprovalPromptProps {
  taskId: string
}

/** `AGENT_FRAMEWORK.md` §6's human approval gate, rendered — a High-risk tool call the agent
 *  wants to run, paused until this resolves. Denying doesn't cancel the task (see PROGRESS.md's
 *  Phase 8 entry): the agent gets "Action denied by user" (optionally with the reason typed
 *  below, e.g. "wrong file, try src/utils.ts instead") as its tool result and re-plans — the same
 *  "let the human explain why" capability Cline's own rejection flow has
 *  (`docs/reference/cline/APPROVAL_GATE_NOTES.md`, which named this as a real gap). */
export function AgentApprovalPrompt({ taskId }: AgentApprovalPromptProps): JSX.Element | null {
  const pending = useAppStore((state) => state.agentPendingApproval[taskId])
  const approveAgentTask = useAppStore((state) => state.approveAgentTask)
  const [reason, setReason] = useState('')

  if (!pending) return null

  const deny = (): void => {
    const trimmed = reason.trim()
    void approveAgentTask(taskId, false, trimmed || undefined)
    setReason('')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-status-warning bg-bg-elevated p-3">
      <span className="text-xs font-semibold text-status-warning">Approval required</span>
      <span className="text-sm text-text-primary">{pending.action}</span>
      {pending.preview && (
        <pre className="overflow-x-auto rounded bg-bg-input p-2 text-xs text-text-secondary">
          {pending.preview}
        </pre>
      )}
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason for denying (optional) — shown to the agent"
        className="rounded border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary"
      />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void approveAgentTask(taskId, true)}>
          Approve
        </Button>
        <Button variant="danger" size="sm" onClick={deny}>
          Deny
        </Button>
      </div>
    </div>
  )
}
