import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { useAppStore } from '../../store'
import type { AgentTask, AgentTaskStep } from '../../types/agent'
import { AgentApprovalPrompt } from './AgentApprovalPrompt'
import { AgentBrowserView } from '../browser/AgentBrowserView'

function isScreenshotDataUri(step: AgentTaskStep): boolean {
  return step.tool === 'browser_screenshot' && (step.result?.startsWith('data:image/png;base64,') ?? false)
}

export interface AgentStepTimelineProps {
  task: AgentTask
}

const STATUS_ICON: Record<AgentTaskStep['status'], JSX.Element> = {
  pending: <Circle size={14} className="text-text-secondary" />,
  running: <Loader2 size={14} className="animate-spin text-status-info" />,
  completed: <CheckCircle2 size={14} className="text-status-success" />,
  failed: <XCircle size={14} className="text-status-error" />,
}

// A stable reference, not `?? []` inline in the selector below — `agentStepsByTask[task.id]` is
// legitimately absent for any task `loadAgentTasks()` fetched but `selectAgentTask()` hasn't yet
// populated steps for (a real window, not just a test artifact: the async steps fetch hasn't
// resolved yet). An inline `?? []` would construct a *new* array every render, which Zustand's
// reference-equality change detection sees as "the selected value changed" — an infinite
// render loop, not a one-off re-render (caught by this file's own test suite, not by review).
const EMPTY_STEPS: AgentTaskStep[] = []

export function AgentStepTimeline({ task }: AgentStepTimelineProps): JSX.Element {
  const steps = useAppStore((state) => state.agentStepsByTask[task.id] ?? EMPTY_STEPS)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {steps.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-text-secondary">
            {task.status === 'pending' ? 'Waiting for the agent to start…' : 'No tool calls yet.'}
          </div>
        ) : (
          <ol className="flex flex-col gap-2 p-3">
            {[...steps]
              .sort((a, b) => a.index - b.index)
              .map((step) => (
                <li key={step.id} className="flex gap-2 rounded border border-border-subtle p-2">
                  <div className="pt-0.5">{STATUS_ICON[step.status]}</div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-xs text-text-primary">{step.tool}</span>
                    {Object.keys(step.args).length > 0 && (
                      <pre className="overflow-x-auto rounded bg-bg-input p-1.5 text-[11px] text-text-secondary">
                        {JSON.stringify(step.args, null, 2)}
                      </pre>
                    )}
                    {step.result && isScreenshotDataUri(step) ? (
                      <AgentBrowserView dataUri={step.result} />
                    ) : (
                      step.result && (
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg-elevated p-1.5 text-[11px] text-text-secondary">
                          {step.result}
                        </pre>
                      )
                    )}
                  </div>
                </li>
              ))}
          </ol>
        )}
        {task.status === 'failed' && task.error && (
          <div className="px-3 pb-3 text-xs text-status-error">{task.error}</div>
        )}
        {task.status === 'completed' && task.result && (
          <div className="px-3 pb-3 text-xs text-status-success">{task.result}</div>
        )}
      </div>
      <AgentApprovalPrompt taskId={task.id} />
    </div>
  )
}
