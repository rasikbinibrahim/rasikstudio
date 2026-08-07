import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { ChatPanel } from './ChatPanel'

describe('ChatPanel', () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaceRoot: '/ws',
      user: { id: 'u1', email: 'dev@example.com', name: 'Dev', avatarUrl: null },
      backendWorkspaceId: 'bw1',
      loadChatSessions: vi.fn(async () => undefined),
      chatSessions: [],
      activeChatSessionId: null,
      chatMessagesBySession: {},
      chatError: null,
    })
  })

  it('prompts to open a folder first when no workspace is open', () => {
    useAppStore.setState({ workspaceRoot: null })
    render(<ChatPanel />)
    expect(screen.getByText(/Open a folder first/)).toBeInTheDocument()
  })

  it('prompts to sign in when no workspace-scoped user is set', async () => {
    const openAuthDialog = vi.fn()
    useAppStore.setState({ user: null, openAuthDialog })
    render(<ChatPanel />)

    expect(screen.getByText('Sign in to use AI chat.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(openAuthDialog).toHaveBeenCalledOnce()
  })

  it('shows a connecting message while the backend workspace sync has not resolved yet', () => {
    useAppStore.setState({ backendWorkspaceId: null })
    render(<ChatPanel />)
    expect(screen.getByText(/Connecting this workspace to the backend/)).toBeInTheDocument()
  })

  it('loads chat sessions once signed in with a synced workspace', async () => {
    const loadChatSessions = vi.fn(async () => undefined)
    useAppStore.setState({ loadChatSessions })
    render(<ChatPanel />)

    await waitFor(() => expect(loadChatSessions).toHaveBeenCalledOnce())
  })

  it('prompts to start a new chat when signed in but no sessions exist yet', () => {
    render(<ChatPanel />)
    expect(screen.getByText('Start a new chat to ask the assistant about this workspace.')).toBeInTheDocument()
  })

  it('shows the message list and input once a session is active', () => {
    useAppStore.setState({
      chatSessions: [
        { id: 's1', workspaceId: 'bw1', title: 'Chat', model: 'gpt-4o-mini', systemPrompt: null, createdAt: '', updatedAt: '' },
      ],
      activeChatSessionId: 's1',
      chatMessagesBySession: { s1: [] },
    })
    render(<ChatPanel />)

    expect(screen.getByPlaceholderText(/Ask about this workspace/)).toBeInTheDocument()
  })

  it('shows the chat error banner when set', () => {
    useAppStore.setState({
      chatSessions: [
        { id: 's1', workspaceId: 'bw1', title: 'Chat', model: 'gpt-4o-mini', systemPrompt: null, createdAt: '', updatedAt: '' },
      ],
      chatError: 'Failed to send message',
    })
    render(<ChatPanel />)

    expect(screen.getByText('Failed to send message')).toBeInTheDocument()
  })
})
