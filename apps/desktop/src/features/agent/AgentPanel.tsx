import { useEffect } from 'react'
import { useAppStore } from '../../store'
import { AgentTaskList } from './AgentTaskList'
import { AgentStepTimeline } from './AgentStepTimeline'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'

export function AgentPanel(): JSX.Element {
  const user = useAppStore((state) => state.user)
  const backendWorkspaceId = useAppStore((state) => state.backendWorkspaceId)
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const openAuthDialog = useAppStore((state) => state.openAuthDialog)
  const loadAgentTasks = useAppStore((state) => state.loadAgentTasks)
  const tasks = useAppStore((state) => state.agentTasks)
  const activeAgentTaskId = useAppStore((state) => state.activeAgentTaskId)
  const cancelAgentTask = useAppStore((state) => state.cancelAgentTask)
  const agentError = useAppStore((state) => state.agentError)

  useEffect(() => {
    if (user && backendWorkspaceId) void loadAgentTasks()
  }, [user, backendWorkspaceId, loadAgentTasks])

  if (!workspaceRoot) {
    return <EmptyState message="Open a folder first — agent tasks run against a workspace." />
  }
  if (!user) {
    return (
      <EmptyState message="Sign in to run agent tasks.">
        <button type="button" onClick={openAuthDialog} className="text-xs text-accent-primary hover:underline">
          Sign In
        </button>
      </EmptyState>
    )
  }
  if (!backendWorkspaceId) {
    return (
      <EmptyState message="Connecting this workspace to the backend… if this doesn't resolve, check that the backend is running." />
    )
  }

  const activeTask = tasks.find((t) => t.id === activeAgentTaskId) ?? null
  const canCancel = activeTask && (activeTask.status === 'running' || activeTask.status === 'paused')

  return (
    <div className="flex h-full flex-col">
      <AgentTaskList />
      {agentError && <div className="px-3 py-1 text-xs text-status-error">{agentError}</div>}
      {activeTask ? (
        <>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="truncate text-xs text-text-secondary">{activeTask.description}</span>
            {canCancel && (
              <Button variant="danger" size="sm" onClick={() => void cancelAgentTask(activeTask.id)}>
                Cancel
              </Button>
            )}
          </div>
          <AgentStepTimeline task={activeTask} />
        </>
      ) : (
        <EmptyState message="Describe a task above and click Run, or select a task from the list." />
      )}
    </div>
  )
}
