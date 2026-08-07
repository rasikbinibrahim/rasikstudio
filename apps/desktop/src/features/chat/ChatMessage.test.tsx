import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageData } from '../../types/chat'

function message(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: 'hello world',
    finishReason: 'stop',
    model: 'gpt-4o-mini',
    createdAt: '2026-08-07T00:00:00Z',
    streaming: false,
    ...overrides,
  }
}

describe('ChatMessage', () => {
  it('renders the role label and markdown content', () => {
    render(<ChatMessage message={message({ role: 'user', content: 'hi there' })} />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('hi there')).toBeInTheDocument()
  })

  it('renders a code block from fenced markdown, syntax-highlighted', () => {
    // Syntax highlighting splits the code across several <span>s (one per token), so a single
    // getByText('const x = 1') can't match — assert on the <code> element's combined text
    // instead, and that highlighting actually ran (a real hljs-* class, not just a plain <code>).
    render(<ChatMessage message={message({ content: '```js\nconst x = 1\n```' })} />)

    const code = document.querySelector('pre code')
    expect(code?.textContent?.trim()).toBe('const x = 1')
    expect(code?.querySelector('[class*="hljs-"]')).toBeInTheDocument()
  })

  it('shows "(empty response)" for a finished message with no content', () => {
    render(<ChatMessage message={message({ content: '', streaming: false })} />)
    expect(screen.getByText('(empty response)')).toBeInTheDocument()
  })

  it('shows nothing (not the empty-response placeholder) while a streaming message has no content yet', () => {
    render(<ChatMessage message={message({ content: '', streaming: true })} />)
    expect(screen.queryByText('(empty response)')).not.toBeInTheDocument()
  })

  it('shows an error note when the finish reason is "error"', () => {
    render(<ChatMessage message={message({ finishReason: 'error' })} />)
    expect(screen.getByText('Something went wrong generating this reply.')).toBeInTheDocument()
  })

  it('does not show an error note for a normal finish reason', () => {
    render(<ChatMessage message={message({ finishReason: 'stop' })} />)
    expect(screen.queryByText('Something went wrong generating this reply.')).not.toBeInTheDocument()
  })
})
