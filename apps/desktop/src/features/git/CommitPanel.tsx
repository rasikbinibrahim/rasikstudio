import { Sparkles } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

export function CommitPanel(): JSX.Element {
  const message = useAppStore((state) => state.gitCommitMessage)
  const setMessage = useAppStore((state) => state.setCommitMessage)
  const generating = useAppStore((state) => state.gitGeneratingCommitMessage)
  const committing = useAppStore((state) => state.gitCommitting)
  const generate = useAppStore((state) => state.generateCommitMessage)
  const commit = useAppStore((state) => state.commit)
  const accessToken = useAppStore((state) => state.accessToken)
  const stagedCount = useAppStore((state) => state.gitStatus?.staged.length ?? 0)

  return (
    <div className="flex flex-col gap-1.5 border-t border-border-subtle p-2">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Commit message"
        rows={3}
        className="w-full resize-none rounded border border-border-default bg-bg-input px-2 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-accent-primary"
      />
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          icon={<Sparkles size={12} />}
          disabled={!accessToken || stagedCount === 0 || generating}
          onClick={() => void generate()}
          title={!accessToken ? 'Sign in to generate a commit message' : undefined}
        >
          {generating ? 'Generating…' : 'Generate'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={stagedCount === 0 || !message.trim() || committing}
          onClick={() => void commit()}
          className="flex-1"
        >
          {committing ? 'Committing…' : `Commit${stagedCount > 0 ? ` (${stagedCount})` : ''}`}
        </Button>
      </div>
    </div>
  )
}
