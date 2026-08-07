import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

// A curated default list, not a live `GET /api/v1/models` fetch — same honest-hardcoding pattern
// as `types/agent.ts`'s AGENT_TYPES (no desktop model-catalog client exists yet). Matches
// MODEL_ROUTER.md §7's CONTEXT_WINDOWS entries for the most common local + cloud defaults.
const DEFAULT_MODELS = [
  { id: 'qwen2.5-coder:1.5b', label: 'Qwen 2.5 Coder 1.5B (local)' },
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B (local)' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
]

export function ChatSessionList(): JSX.Element {
  const sessions = useAppStore((state) => state.chatSessions)
  const activeChatSessionId = useAppStore((state) => state.activeChatSessionId)
  const selectChatSession = useAppStore((state) => state.selectChatSession)
  const createChatSession = useAppStore((state) => state.createChatSession)
  const deleteChatSession = useAppStore((state) => state.deleteChatSession)
  const [model, setModel] = useState(DEFAULT_MODELS[0]?.id ?? 'gpt-4o-mini')

  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle p-2">
      <div className="flex items-center gap-1.5">
        <select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="flex-1 rounded border border-border-default bg-bg-input px-1.5 py-1 text-xs text-text-primary focus:outline-none"
        >
          {DEFAULT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
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
      {sessions.length > 0 && (
        <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {sessions.map((session) => (
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
