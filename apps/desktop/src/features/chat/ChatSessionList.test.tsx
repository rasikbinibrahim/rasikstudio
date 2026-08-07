import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { ChatSessionList } from './ChatSessionList'
import type { ChatSession } from '../../types/chat'

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    workspaceId: 'w1',
    title: 'New Chat',
    model: 'gpt-4o-mini',
    systemPrompt: null,
    createdAt: '2026-08-07T00:00:00Z',
    updatedAt: '2026-08-07T00:00:00Z',
    ...overrides,
  }
}

describe('ChatSessionList', () => {
  beforeEach(() => {
    useAppStore.setState({ chatSessions: [], activeChatSessionId: null })
  })

  it('creates a new session with the selected model when New is clicked', async () => {
    const createChatSession = vi.fn()
    useAppStore.setState({ createChatSession })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: 'New chat session' }))

    expect(createChatSession).toHaveBeenCalledWith('qwen2.5-coder:1.5b')
  })

  it('lists every session and highlights the active one', () => {
    useAppStore.setState({
      chatSessions: [session({ id: 's1', title: 'First chat' }), session({ id: 's2', title: 'Second chat' })],
      activeChatSessionId: 's2',
    })
    render(<ChatSessionList />)

    expect(screen.getByText('First chat')).toBeInTheDocument()
    const active = screen.getByText('Second chat').closest('div')
    expect(active).toHaveClass('bg-bg-active')
  })

  it('selects a session when its title is clicked', async () => {
    const selectChatSession = vi.fn()
    useAppStore.setState({ chatSessions: [session()], selectChatSession })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByText('New Chat'))

    expect(selectChatSession).toHaveBeenCalledWith('s1')
  })

  it('deletes a session via its delete button', async () => {
    const deleteChatSession = vi.fn()
    useAppStore.setState({ chatSessions: [session({ title: 'Old chat' })], deleteChatSession })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete "Old chat"' }))

    expect(deleteChatSession).toHaveBeenCalledWith('s1')
  })
})
