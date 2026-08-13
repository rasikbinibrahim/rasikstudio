import { useState } from 'react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

export interface AgentQuestionPromptProps {
  taskId: string
}

/** The `ask_followup_question` tool's own pause, rendered — Cline's `ask_followup_question`
 *  equivalent (`docs/reference/cline/TOOL_DESIGN_NOTES.md`, which named this project's total lack
 *  of a mid-task clarifying-question capability as a real gap: previously an ambiguous task only
 *  ever got a best-effort guess or the binary approve/deny gate, never an open-ended question
 *  back to the user). Distinct from `AgentApprovalPrompt` — a free-text answer, not a yes/no
 *  decision on one already-decided action. */
export function AgentQuestionPrompt({ taskId }: AgentQuestionPromptProps): JSX.Element | null {
  const pending = useAppStore((state) => state.agentPendingQuestion[taskId])
  const answerAgentQuestion = useAppStore((state) => state.answerAgentQuestion)
  const [answer, setAnswer] = useState('')

  if (!pending) return null

  const submit = (): void => {
    const trimmed = answer.trim()
    if (!trimmed) return
    void answerAgentQuestion(taskId, trimmed)
    setAnswer('')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-status-info bg-bg-elevated p-3">
      <span className="text-xs font-semibold text-status-info">The agent has a question</span>
      <span className="text-sm text-text-primary">{pending.question}</span>
      <input
        type="text"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder="Your answer"
        autoFocus
        className="rounded border border-border-subtle bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary"
      />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={!answer.trim()}>
          Send
        </Button>
      </div>
    </div>
  )
}
