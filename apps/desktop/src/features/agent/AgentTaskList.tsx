import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'
import { ModelPicker } from '../../components/ui/ModelPicker'
import { AGENT_TYPES } from '../../types/agent'
import type { AgentTaskStatus } from '../../types/agent'

// Fallback only — used when the live `GET /api/v1/models` catalog (`models-slice.ts`) hasn't
// loaded yet or came back empty. `AGENT_TYPES` above stays hardcoded regardless (no `GET
// /agents/types`-style endpoint exists — a separate, still-real gap this doesn't close).
const FALLBACK_MODELS = [
  { id: 'claude-sonnet-4-5', provider: 'anthropic' },
  { id: 'gpt-4o-mini', provider: 'openai' },
  { id: 'qwen2.5-coder:1.5b', provider: 'ollama' },
]

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
  const loadAgentTasks = useAppStore((state) => state.loadAgentTasks)
  const openSettings = useAppStore((state) => state.openSettings)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const modelOptions = useMemo(
    () =>
      liveModels.length > 0
        ? liveModels.map((m) => ({ id: m.id, label: m.id, provider: m.provider, available: m.available }))
        : FALLBACK_MODELS.map((m) => ({ ...m, label: m.id, available: true })),
    [liveModels],
  )

  const [description, setDescription] = useState('')
  const [agentType, setAgentType] = useState<string>(AGENT_TYPES[1]) // 'coder' — the common case
  const [model, setModel] = useState(modelOptions[0]?.id ?? 'gpt-4o-mini')
  // Same "reset only if the current selection no longer exists" pattern as
  // `ChatSessionList.tsx`'s own model picker — see that component's comment for why.
  useEffect(() => {
    if (!modelOptions.some((m) => m.id === model)) setModel(modelOptions[0]?.id ?? 'gpt-4o-mini')
  }, [modelOptions, model])

  function handleCreate(): void {
    if (!description.trim()) return
    void createAgentTask(agentType, description, model)
    setDescription('')
  }

  const visibleTasks = filterQuery.trim()
    ? tasks.filter((t) => t.description.toLowerCase().includes(filterQuery.trim().toLowerCase()))
    : tasks

  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Tasks</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Refresh tasks"
            onClick={() => void loadAgentTasks()}
            className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            aria-label="Filter tasks"
            aria-pressed={filterOpen}
            onClick={() => setFilterOpen((prev) => !prev)}
            className={[
              'rounded p-1 hover:bg-bg-overlay hover:text-text-primary',
              filterOpen ? 'bg-bg-active text-text-primary' : 'text-text-secondary',
            ].join(' ')}
          >
            <Search size={12} />
          </button>
        </div>
      </div>
      {filterOpen && (
        <input
          autoFocus
          value={filterQuery}
          onChange={(event) => setFilterQuery(event.target.value)}
          placeholder="Filter tasks by description…"
          className="rounded border border-border-default bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
      )}
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
        <ModelPicker options={modelOptions} value={model} onChange={setModel} onManageModels={openSettings} className="flex-1" />
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
      {visibleTasks.length > 0 && (
        <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
          {visibleTasks.map((task) => (
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
