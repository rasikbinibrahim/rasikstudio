import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store'
import {
  deleteOllamaModel,
  listInstalledOllamaModels,
  pullOllamaModel,
  type OllamaModel,
  type OllamaPullProgress,
} from '../../services/ollama-client'

function formatSize(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function formatProgress(progress: OllamaPullProgress): string {
  if (progress.error) return `Error: ${progress.error}`
  if (progress.total && progress.completed !== null) {
    const percent = Math.round((progress.completed / progress.total) * 100)
    return `${progress.status} (${percent}%)`
  }
  return progress.status
}

/** `docs/reference/ollama/ANALYSIS.md` §8's real, previously-untracked gap — a user had to
 *  already know to run the `ollama` CLI directly before this app's local-model chat/completion
 *  features had anything to talk to. Local component state (not a store slice): this is a
 *  one-off settings-panel feature with no other component needing to observe its state, the same
 *  judgment call `Settings.tsx`'s own `backendUrlDraft` already makes for its one local field. */
export function OllamaModelsSection(): JSX.Element {
  const accessToken = useAppStore((state) => state.accessToken)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      setModels(await listInstalledOllamaModels(accessToken))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach Ollama')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // Only on mount / when the panel first gets a token — refreshed explicitly afterwards (a
    // successful pull or delete), not on every accessToken identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pull = async (): Promise<void> => {
    const name = pullName.trim()
    if (!accessToken || !name || pulling) return
    setPulling(true)
    setError(null)
    setPullProgress(null)
    try {
      await pullOllamaModel(accessToken, name, setPullProgress)
      setPullName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull model')
    } finally {
      setPulling(false)
    }
  }

  const remove = async (name: string): Promise<void> => {
    if (!accessToken) return
    setDeletingName(name)
    setError(null)
    try {
      await deleteOllamaModel(accessToken, name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model')
    } finally {
      setDeletingName(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Ollama Models
      </h3>

      {loading ? (
        <span className="text-sm text-text-secondary">Loading installed models…</span>
      ) : models.length === 0 ? (
        <span className="text-sm text-text-secondary">
          No models installed, or Ollama isn&apos;t reachable.
        </span>
      ) : (
        <ul className="flex flex-col gap-1">
          {models.map((model) => (
            <li key={model.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text-primary">{model.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">{formatSize(model.sizeBytes)}</span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deletingName === model.name}
                  onClick={() => void remove(model.name)}
                >
                  {deletingName === model.name ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={pullName}
          onChange={(event) => setPullName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void pull()
          }}
          placeholder="Model name, e.g. qwen2.5-coder:1.5b"
          disabled={pulling}
          className="flex-1 rounded border border-border-default bg-bg-input px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
        />
        <Button variant="primary" size="sm" onClick={() => void pull()} disabled={pulling || !pullName.trim()}>
          {pulling ? 'Pulling…' : 'Pull'}
        </Button>
      </div>

      {pullProgress && (
        <span className="text-xs text-text-secondary">{formatProgress(pullProgress)}</span>
      )}
      {error && <span className="text-xs text-status-error">{error}</span>}
    </section>
  )
}
