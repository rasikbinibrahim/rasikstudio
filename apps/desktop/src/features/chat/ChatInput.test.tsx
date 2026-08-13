import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { ChatInput } from './ChatInput'
import { FILE_PATH_DRAG_MIME_TYPE } from '../../lib/file-drag-mime'

function fileDragDataTransfer(path: string) {
  return {
    types: [FILE_PATH_DRAG_MIME_TYPE],
    getData: (type: string) => (type === FILE_PATH_DRAG_MIME_TYPE ? path : ''),
  }
}

describe('ChatInput', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeChatSessionId: 's1',
      activeFileId: null,
      openFiles: [],
    })
    ;(window as unknown as { rasik: object }).rasik = {
      files: { read: vi.fn(async () => ({ ok: true, data: 'file contents' })) },
    }
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

    expect(sendChatMessage).toHaveBeenCalledWith('hello', undefined, false)
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
        { id: 'f1', path: 'src/App.tsx', name: 'App.tsx', content: 'export {}', isDirty: false },
      ],
    })
    render(<ChatInput />)

    await userEvent.click(screen.getByRole('button', { name: 'App.tsx' }))
    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), 'what does this do?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendChatMessage).toHaveBeenCalledWith(
      'what does this do?',
      { path: 'src/App.tsx', content: 'export {}' },
      false,
    )
  })

  it('shows an "Uncommitted changes" toggle even with no active file, and sends includeGitDiff when enabled', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({ sendChatMessage })
    render(<ChatInput />)

    await userEvent.click(screen.getByRole('button', { name: 'Uncommitted changes' }))
    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), 'what changed?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendChatMessage).toHaveBeenCalledWith('what changed?', undefined, true)
  })

  it('dropping a file reads its content and shows it as an attachment chip', async () => {
    render(<ChatInput />)
    const dropZone = screen.getByPlaceholderText(/Ask about this workspace/).closest('div')?.parentElement
    if (!dropZone) throw new Error('drop zone not found')

    fireEvent.drop(dropZone, { dataTransfer: fileDragDataTransfer('src/utils.ts') })

    await screen.findByText('utils.ts')
    expect(window.rasik.files.read).toHaveBeenCalledWith('src/utils.ts')
  })

  it('sends the dropped file as the attachment, taking priority over the active-file toggle', async () => {
    const sendChatMessage = vi.fn()
    useAppStore.setState({
      sendChatMessage,
      activeFileId: 'f1',
      openFiles: [
        { id: 'f1', path: 'src/App.tsx', name: 'App.tsx', content: 'export {}', isDirty: false },
      ],
    })
    render(<ChatInput />)
    const dropZone = screen.getByPlaceholderText(/Ask about this workspace/).closest('div')?.parentElement
    if (!dropZone) throw new Error('drop zone not found')
    fireEvent.drop(dropZone, { dataTransfer: fileDragDataTransfer('src/utils.ts') })
    await screen.findByText('utils.ts')

    await userEvent.type(screen.getByPlaceholderText(/Ask about this workspace/), 'explain this')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendChatMessage).toHaveBeenCalledWith(
      'explain this',
      { path: 'src/utils.ts', content: 'file contents' },
      false,
    )
  })

  it('removes the dropped-file attachment when its close button is clicked', async () => {
    render(<ChatInput />)
    const dropZone = screen.getByPlaceholderText(/Ask about this workspace/).closest('div')?.parentElement
    if (!dropZone) throw new Error('drop zone not found')
    fireEvent.drop(dropZone, { dataTransfer: fileDragDataTransfer('src/utils.ts') })
    await screen.findByText('utils.ts')

    await userEvent.click(screen.getByRole('button', { name: 'Remove utils.ts attachment' }))

    expect(screen.queryByText('utils.ts')).not.toBeInTheDocument()
  })

  it('ignores a drop with no file-path data', async () => {
    render(<ChatInput />)
    const dropZone = screen.getByPlaceholderText(/Ask about this workspace/).closest('div')?.parentElement
    if (!dropZone) throw new Error('drop zone not found')

    fireEvent.drop(dropZone, { dataTransfer: { types: [], getData: () => '' } })

    expect(window.rasik.files.read).not.toHaveBeenCalled()
  })
})
