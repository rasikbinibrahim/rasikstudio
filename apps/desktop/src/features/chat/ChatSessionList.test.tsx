import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    useAppStore.setState({ chatSessions: [], activeChatSessionId: null, models: [] })
  })

  it('creates a new session with the selected (default) model when New is clicked', async () => {
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

  it('calls loadModels on mount', () => {
    const loadModels = vi.fn(async () => undefined)
    useAppStore.setState({ loadModels })

    render(<ChatSessionList />)

    expect(loadModels).toHaveBeenCalled()
  })

  it('re-fetches sessions when the refresh icon is clicked', async () => {
    const loadChatSessions = vi.fn(async () => undefined)
    useAppStore.setState({ loadChatSessions })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))

    expect(loadChatSessions).toHaveBeenCalled()
  })

  it('filters the visible session list by title once the filter icon is toggled on', async () => {
    useAppStore.setState({
      chatSessions: [session({ id: 's1', title: 'Alpha chat' }), session({ id: 's2', title: 'Beta chat' })],
    })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: 'Filter sessions' }))
    await userEvent.type(screen.getByPlaceholderText('Filter sessions by title…'), 'Alpha')

    expect(screen.getByText('Alpha chat')).toBeInTheDocument()
    expect(screen.queryByText('Beta chat')).not.toBeInTheDocument()
  })

  it('uses the live model catalog once loaded, tagging unavailable models instead of the fallback list', async () => {
    const createChatSession = vi.fn()
    useAppStore.setState({
      createChatSession,
      models: [
        { id: 'live-model-a', provider: 'openai', contextWindow: 128000, available: true },
        { id: 'live-model-b', provider: 'ollama', contextWindow: 32768, available: false },
      ],
    })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: /live-model-a/ }))

    expect(screen.getByRole('menuitem', { name: /live-model-a/ })).toBeInTheDocument()
    const unavailable = screen.getByRole('menuitem', { name: /live-model-b/ })
    expect(unavailable).toHaveTextContent('Not configured')
    expect(screen.queryByText(/qwen2\.5-coder/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: /live-model-a/ }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'New chat session' }))
    expect(createChatSession).toHaveBeenCalledWith('live-model-a')
  })

  it('opens Settings when "Manage Models…" is selected from the model picker', async () => {
    const openSettings = vi.fn()
    useAppStore.setState({ openSettings })
    render(<ChatSessionList />)

    await userEvent.click(screen.getByRole('button', { name: /qwen2\.5-coder/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Manage Models/ }))

    expect(openSettings).toHaveBeenCalled()
  })
})
