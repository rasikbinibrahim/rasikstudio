import { useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import { GitCompare, Paperclip, Send, X } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'
import { basename } from '../../lib/path-utils'
import { FILE_PATH_DRAG_MIME_TYPE } from '../../lib/file-drag-mime'

interface DroppedFileAttachment {
  path: string
  name: string
  content: string
}

/** Textarea (not the shared `Input` primitive, which is single-line) + send button + an
 *  "attach active file" toggle, a drag-and-drop file attach, and an "include uncommitted
 *  changes" toggle. Drag-and-drop was previously deferred in favor of the active-file toggle
 *  alone (see `PROGRESS.md`'s Phase 10 desktop entry) since the two cover the same underlying
 *  need with the toggle's materially simpler interaction — this adds the drag-and-drop path too,
 *  for attaching a file that isn't the one currently open in the editor. A dropped file takes
 *  priority over the active-file toggle if both are somehow set (an explicit drag is a more
 *  deliberate action than a toggle left on from an earlier message). The git-diff toggle is the
 *  desktop half of the gap named comparing this project against Continue's own `@diff` context
 *  provider (`docs/reference/continue/CONTEXT_BUILDING_NOTES.md`). */
export function ChatInput(): JSX.Element {
  const [value, setValue] = useState('')
  const [attachActiveFile, setAttachActiveFile] = useState(false)
  const [droppedFile, setDroppedFile] = useState<DroppedFileAttachment | null>(null)
  const [includeGitDiff, setIncludeGitDiff] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
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
    const attachment = droppedFile
      ? { path: droppedFile.path, content: droppedFile.content }
      : attachActiveFile && activeFile
        ? { path: activeFile.path, content: activeFile.content }
        : null
    void sendChatMessage(content, attachment ?? undefined, includeGitDiff)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!event.dataTransfer.types.includes(FILE_PATH_DRAG_MIME_TYPE)) return
    event.preventDefault()
    setIsDraggingOver(true)
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    setIsDraggingOver(false)
    const path = event.dataTransfer.getData(FILE_PATH_DRAG_MIME_TYPE)
    if (!path) return
    event.preventDefault()
    const result = await window.rasik.files.read(path)
    if (!result.ok) return
    setDroppedFile({ path, name: basename(path), content: result.data })
  }

  return (
    <div
      className={`flex flex-col gap-2 border-t border-border-subtle p-2 transition-colors ${
        isDraggingOver ? 'bg-bg-active' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="flex flex-wrap gap-1.5">
        {droppedFile ? (
          <span className="flex w-fit items-center gap-1.5 rounded border border-accent-primary bg-accent-muted px-2 py-1 text-xs text-text-primary">
            <Paperclip size={12} />
            {droppedFile.name}
            <button
              type="button"
              onClick={() => setDroppedFile(null)}
              aria-label={`Remove ${droppedFile.name} attachment`}
              className="text-text-secondary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </span>
        ) : (
          activeFile && (
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
          )
        )}
        <button
          type="button"
          onClick={() => setIncludeGitDiff((prev) => !prev)}
          aria-pressed={includeGitDiff}
          title="Include the current uncommitted changes (git diff) as context"
          className={[
            'flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-xs',
            includeGitDiff
              ? 'border-accent-primary bg-accent-muted text-text-primary'
              : 'border-border-default text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <GitCompare size={12} />
          Uncommitted changes
        </button>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          id="chat-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this workspace… (Enter to send, Shift+Enter for a new line, or drag a file here to attach it)"
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
