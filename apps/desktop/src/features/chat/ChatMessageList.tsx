import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageData } from '../../types/chat'

export interface ChatMessageListProps {
  messages: ChatMessageData[]
}

/** Virtualized per `phase-10-ai-chat.md`'s own acceptance criteria — a long-running chat session
 *  can accumulate hundreds of messages, and rendering all of them (each running markdown +
 *  syntax-highlighting) would make scrolling janky well before that. Auto-scrolls to the bottom
 *  whenever the message count or the last message's content changes (covers both a new message
 *  arriving and the active streaming message growing token-by-token). */
export function ChatMessageList({ messages }: ChatMessageListProps): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const lastMessage = messages[messages.length - 1]

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  })

  // Re-runs on content growth (streaming) too, not just message count, so auto-scroll keeps up
  // with a reply that's still being written. `react-hooks/exhaustive-deps` isn't actually wired
  // up in this repo's flat-config setup yet (TASKS.md), so there's no lint to suppress for the
  // intentionally-partial dependency list (`virtualizer` is stable across renders).
  useEffect(() => {
    if (messages.length === 0) return
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
  }, [messages.length, lastMessage?.content])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-secondary">
        Ask anything about this workspace — the assistant can see files you attach and search the
        codebase for relevant context.
      </div>
    )
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = messages[virtualItem.index]
          if (!message) return null
          return (
            <div
              key={message.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualItem.start}px)` }}
            >
              <ChatMessage message={message} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
