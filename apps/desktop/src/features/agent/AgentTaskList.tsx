import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'
import { AGENT_TYPES } from '../../types/agent'
import type { AgentTaskStatus } from '../../types/agent'

// Fallback only — used when the live `GET /api/v1/models` catalog (`models-slice.ts`) hasn't
// loaded yet or came back empty. `AGENT_TYPES` above stays hardcoded regardless (no `GET
// /agents/types`-style endpoint exists — a separate, still-real gap this doesn't close).
const FALLBACK_MODELS = ['claude-sonnet-4-5', 'gpt-4o-mini', 'qwen2.5-coder:1.5b']

const STATUS_COLOR: Record<AgentTaskStatus, string> = {
  pending: 'text-text-secondary',
  running: 'text-status-info',
  paused: 'text-status-warning',
  completed: 'text-status-success',
  failed: 'text-status-error',
  cancelled: 'text-text-secondary',
}

export function AgentTaskList(): JSX.Element {
  const tasks = useAppStore((state) => state.agentTasks)
  const activeAgentTaskId = useAppStore((state) => state.activeAgentTaskId)
  const selectAgentTask = useAppStore((state) => state.selectAgentTask)
  const createAgentTask = useAppStore((state) => state.createAgentTask)
  const liveModels = useAppStore((state) => state.models)
  const loadModels = useAppStore((state) => state.loadModels)

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const modelOptions = useMemo(
    () => (liveModels.length > 0 ? liveModels.map((m) => m.id) : FALLBACK_MODELS),
    [liveModels],
  )

  const [description, setDescription] = useState('')
  const [agentType, setAgentType] = useState<string>(AGENT_TYPES[1]) // 'coder' — the common case
  const [model, setModel] = useState(modelOptions[0] ?? 'gpt-4o-mini')
  // Same "reset only if the current selection no longer exists" pattern as
  // `ChatSessionList.tsx`'s own model picker — see that component's comment for why.
  useEffect(() => {
    if (!modelOptions.includes(model)) setModel(modelOptions[0] ?? 'gpt-4o-mini')
  }, [modelOptions, model])

  function handleCreate(): void {
    if (!description.trim()) return
    void createAgentTask(agentType, description, model)
    setDescription('')
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle p-2">
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Describe the task — e.g. 'Add input validation to the login form'"
        rows={2}
        className="resize-none rounded border border-border-default bg-bg-input px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary"
      />
      <div className="flex items-center gap-1.5">
        <select
          value={agentType}
          onChange={(event) => setAgentType(event.target.value)}
          className="rounded border border-border-default bg-bg-input px-1.5 py-1 text-xs text-text-primary focus:outline-none"
        >
          {AGENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="flex-1 rounded border border-border-default bg-bg-input px-1.5 py-1 text-xs text-text-primary focus:outline-none"
        >
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          disabled={!description.trim()}
          onClick={handleCreate}
          aria-label="Run agent task"
        >
          Run
        </Button>
      </div>
      {tasks.length > 0 && (
        <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => void selectAgentTask(task.id)}
              className={[
                'flex flex-col gap-0.5 rounded px-1.5 py-1 text-left text-xs',
                task.id === activeAgentTaskId
                  ? 'bg-bg-active text-text-primary'
                  : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary',
              ].join(' ')}
            >
              <span className="truncate">{task.description}</span>
              <span className={['text-[10px] uppercase tracking-wide', STATUS_COLOR[task.status]].join(' ')}>
                {task.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
