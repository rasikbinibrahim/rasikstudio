import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Paperclip, Send } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'

/** Textarea (not the shared `Input` primitive, which is single-line) + send button + an
 *  "attach active file" toggle. Covers the phase's active-file-context and drag-and-drop-attach
 *  criteria via the simpler of the two: a toggle for "the file I'm already looking at," rather
 *  than a drag target — see PROGRESS.md's Phase 10 desktop entry for why drag-and-drop itself is
 *  deferred (a materially bigger, separate interaction to design well, not skipped for no reason). */
export function ChatInput(): JSX.Element {
  const [value, setValue] = useState('')
  const [attachActiveFile, setAttachActiveFile] = useState(false)
  const sendChatMessage = useAppStore((state) => state.sendChatMessage)
  const activeChatSessionId = useAppStore((state) => state.activeChatSessionId)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const openFiles = useAppStore((state) => state.openFiles)

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null
  const canSend = value.trim().length > 0 && activeChatSessionId !== null

  function handleSend(): void {
    if (!canSend) return
    const content = value
    setValue('')
    void sendChatMessage(
      content,
      attachActiveFile && activeFile ? { path: activeFile.path, content: activeFile.content } : undefined,
    )
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle p-2">
      {activeFile && (
        <button
          type="button"
          onClick={() => setAttachActiveFile((prev) => !prev)}
          aria-pressed={attachActiveFile}
          className={[
            'flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-xs',
            attachActiveFile
              ? 'border-accent-primary bg-accent-muted text-text-primary'
              : 'border-border-default text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <Paperclip size={12} />
          {activeFile.name}
        </button>
      )}
      <div className="flex items-end gap-2">
        <textarea
          id="chat-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this workspace… (Enter to send, Shift+Enter for a new line)"
          rows={3}
          className={[
            'flex-1 resize-none rounded border border-border-default bg-bg-input px-2 py-1.5',
            'text-sm text-text-primary placeholder:text-text-secondary focus:outline-none',
            'focus:ring-2 focus:ring-accent-primary',
          ].join(' ')}
        />
        <Button
          variant="primary"
          size="sm"
          icon={<Send size={14} />}
          disabled={!canSend}
          onClick={handleSend}
          aria-label="Send message"
        >
          Send
        </Button>
      </div>
    </div>
  )
}
