import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'
import { ModelPicker } from '../../components/ui/ModelPicker'

// Fallback only — used when the live `GET /api/v1/models` catalog (`models-slice.ts`) hasn't
// loaded yet or came back empty (no backend reachable). Matches MODEL_ROUTER.md §7's
// CONTEXT_WINDOWS entries for the most common local + cloud defaults, the same list this
// component used unconditionally before the live fetch existed.
const FALLBACK_MODELS = [
  { id: 'qwen2.5-coder:1.5b', provider: 'ollama' },
  { id: 'deepseek-r1:7b', provider: 'ollama' },
  { id: 'claude-sonnet-4-5', provider: 'anthropic' },
  { id: 'gpt-4o-mini', provider: 'openai' },
]

export function ChatSessionList(): JSX.Element {
  const sessions = useAppStore((state) => state.chatSessions)
  const activeChatSessionId = useAppStore((state) => state.activeChatSessionId)
  const selectChatSession = useAppStore((state) => state.selectChatSession)
  const createChatSession = useAppStore((state) => state.createChatSession)
  const deleteChatSession = useAppStore((state) => state.deleteChatSession)
  const liveModels = useAppStore((state) => state.models)
  const loadModels = useAppStore((state) => state.loadModels)
  const loadChatSessions = useAppStore((state) => state.loadChatSessions)
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

  const [model, setModel] = useState(modelOptions[0]?.id ?? 'gpt-4o-mini')
  // `modelOptions` starts as the fallback list and, once `loadModels()` resolves, usually swaps
  // to the live catalog — if the currently selected id doesn't exist in the new option set (the
  // common case: the fallback's first entry isn't in the live list), fall back to the new list's
  // own first entry rather than leaving the picker pointed at a now-nonexistent option. A
  // selection the user already made that's *still valid* in the new list is left alone.
  useEffect(() => {
    if (!modelOptions.some((m) => m.id === model)) setModel(modelOptions[0]?.id ?? 'gpt-4o-mini')
  }, [modelOptions, model])

  const visibleSessions = filterQuery.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(filterQuery.trim().toLowerCase()))
    : sessions

  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Sessions</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Refresh sessions"
            onClick={() => void loadChatSessions()}
            className="rounded p-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            aria-label="Filter sessions"
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
          placeholder="Filter sessions by title…"
          className="rounded border border-border-default bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
      )}
      <div className="flex items-center gap-1.5">
        <ModelPicker options={modelOptions} value={model} onChange={setModel} onManageModels={openSettings} className="flex-1" />
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => void createChatSession(model)}
          aria-label="New chat session"
        >
          New
        </Button>
      </div>
      {visibleSessions.length > 0 && (
        <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {visibleSessions.map((session) => (
            <div
              key={session.id}
              className={[
                'group flex items-center gap-1 rounded px-1.5 py-1 text-xs',
                session.id === activeChatSessionId
                  ? 'bg-bg-active text-text-primary'
                  : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => void selectChatSession(session.id)}
                className="flex-1 truncate text-left"
              >
                {session.title}
              </button>
              <button
                type="button"
                aria-label={`Delete "${session.title}"`}
                onClick={() => void deleteChatSession(session.id)}
                className="hidden text-text-secondary hover:text-status-error group-hover:block"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
