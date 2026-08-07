import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeChatSessionId: 's1',
      activeFileId: null,
      openFiles: [],
    })
  })

  it('disables Send when the input is empty', () => {
    render(<ChatInput />)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('enables Send once text is entered, and sends on click', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({ sendChatMessage })
    render(<ChatInput />)

    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), 'hello')
    expect(screen.getByRole('button', { name: 'Send message' })).not.toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendChatMessage).toHaveBeenCalledWith('hello', undefined)
  })

  it('clears the input after sending', async () => {
    useAppStore.setState({ sendChatMessage: vi.fn() })
    render(<ChatInput />)
    const textarea = screen.getByPlaceholderText(/Ask about this workspace/)

    await userEvent.type(textarea, 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(textarea).toHaveValue('')
  })

  it('sends on Enter, but inserts a newline on Shift+Enter instead', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({ sendChatMessage })
    render(<ChatInput />)
    const textarea = screen.getByPlaceholderText(/Ask about this workspace/)

    await userEvent.type(textarea, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(sendChatMessage).not.toHaveBeenCalled()
    expect(textarea).toHaveValue('line one\nline two')

    await userEvent.type(textarea, '{Enter}')
    expect(sendChatMessage).toHaveBeenCalledOnce()
  })

  it('does not send whitespace-only input', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({ sendChatMessage })
    render(<ChatInput />)

    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), '   ')

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('shows no attach toggle when there is no active file', () => {
    render(<ChatInput />)
    expect(screen.queryByRole('button', { name: /\.tsx?$/ })).not.toBeInTheDocument()
  })

  it('attaches the active file when its toggle is enabled and a message is sent', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({
      sendChatMessage,
      activeFileId: 'f1',
      openFiles: [
        { id: 'f1', path: 'src/App.tsx', name: 'App.tsx', content: 'export {}', originalContent: '', isDirty: false, language: 'typescript' },
      ],
    })
    render(<ChatInput />)

    await userEvent.click(screen.getByRole('button', { name: 'App.tsx' }))
    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), 'what does this do?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendChatMessage).toHaveBeenCalledWith('what does this do?', {
      path: 'src/App.tsx',
      content: 'export {}',
    })
  })
})
