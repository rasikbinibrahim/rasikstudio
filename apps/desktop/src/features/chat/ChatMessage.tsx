import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ChatMessage as ChatMessageData } from '../../types/chat'
import '../../styles/chat.css'

export interface ChatMessageProps {
  message: ChatMessageData
}

const ROLE_LABEL: Record<ChatMessageData['role'], string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
}

/** One rendered message — handles both a finished, persisted message and the one currently
 *  streaming (`message.streaming`), so there's a single markdown-rendering code path instead of
 *  a separate `StreamingMessage` component re-implementing it (the roadmap doc's original file
 *  list had the two split; folded together here, see PROGRESS.md's Phase 10 desktop entry). */
export function ChatMessage({ message }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={['flex flex-col gap-1 px-3 py-2', isUser ? 'items-end' : 'items-start'].join(' ')}>
      <span className="text-xs font-medium text-text-secondary">{ROLE_LABEL[message.role]}</span>
      <div
        className={[
          'max-w-[85%] rounded-md px-3 py-2',
          isUser ? 'bg-accent-muted text-text-primary' : 'bg-bg-elevated text-text-primary',
        ].join(' ')}
      >
        {message.content ? (
          <div className="chat-markdown">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </Markdown>
          </div>
        ) : message.streaming ? null : (
          <span className="text-sm italic text-text-secondary">(empty response)</span>
        )}
        {message.streaming && <span className="chat-streaming-cursor" aria-hidden="true" />}
      </div>
      {message.finishReason === 'error' && (
        <span className="text-xs text-status-error">Something went wrong generating this reply.</span>
      )}
    </div>
  )
}
