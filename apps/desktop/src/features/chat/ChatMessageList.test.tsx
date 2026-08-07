import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessageList } from './ChatMessageList'
import type { ChatMessage as ChatMessageData } from '../../types/chat'

function message(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'user',
    content: 'hello',
    finishReason: null,
    model: null,
    createdAt: '2026-08-07T00:00:00Z',
    streaming: false,
    ...overrides,
  }
}

describe('ChatMessageList', () => {
  it('shows an empty-state hint when there are no messages', () => {
    render(<ChatMessageList messages={[]} />)
    expect(screen.getByText(/Ask anything about this workspace/)).toBeInTheDocument()
  })

  it('sizes the virtualized scroll area for every message given', () => {
    // `@tanstack/react-virtual` decides which rows are "visible" from the scroll container's
    // real layout (`getBoundingClientRect`/`ResizeObserver`), neither of which jsdom provides —
    // the same category of gap already accepted for Monaco/DiffViewer elsewhere in this project.
    // What *is* real and verifiable here: the virtualizer received the right message count and
    // computed the right total scrollable height from it (2 messages × the 96px row estimate).
    const { container } = render(
      <ChatMessageList
        messages={[message({ id: 'm1', content: 'first' }), message({ id: 'm2', content: 'second' })]}
      />,
    )

    const sizer = container.querySelector('[style*="height"]')
    expect(sizer).toHaveStyle({ height: '192px' })
  })
})
