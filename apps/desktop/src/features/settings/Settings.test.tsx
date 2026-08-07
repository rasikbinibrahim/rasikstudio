import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { Settings } from './Settings'
import { DEFAULT_BACKEND_HTTP_BASE_URL } from '../../lib/backend-config'

describe('Settings', () => {
  beforeEach(() => {
    useAppStore.setState({
      theme: 'dark',
      editorFontSize: 14,
      editorWordWrap: false,
      backendUrl: DEFAULT_BACKEND_HTTP_BASE_URL,
    })
  })

  it('renders nothing when closed', () => {
    render(<Settings open={false} onClose={() => {}} />)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('shows the current settings when open', () => {
    useAppStore.setState({ editorFontSize: 16, editorWordWrap: true })
    render(<Settings open onClose={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('Font size')).toHaveValue(16)
    expect(screen.getByLabelText('Word wrap')).toBeChecked()
  })

  it('switches the theme when Dark/Light is clicked', async () => {
    const setTheme = vi.fn()
    useAppStore.setState({ setTheme })
    render(<Settings open onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Light' }))

    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('updates the font size', () => {
    // A single `fireEvent.change` (the final typed value in one shot) rather than
    // `userEvent.type` — typing character-by-character into this controlled, clamped (8–32)
    // input fights its own clamping logic (e.g. clearing briefly clamps to 8, then the next
    // keystroke appends onto "8" instead of onto ""), which isn't what this test is about.
    render(<Settings open onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '18' } })

    expect(useAppStore.getState().editorFontSize).toBe(18)
  })

  it('clamps an out-of-range font size to the nearest bound', () => {
    render(<Settings open onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '999' } })

    expect(useAppStore.getState().editorFontSize).toBe(32)
  })

  it('toggles word wrap', async () => {
    const setEditorWordWrap = vi.fn()
    useAppStore.setState({ setEditorWordWrap })
    render(<Settings open onClose={() => {}} />)

    await userEvent.click(screen.getByLabelText('Word wrap'))

    expect(setEditorWordWrap).toHaveBeenCalledWith(true)
  })

  it('commits the backend URL draft on blur', async () => {
    const setBackendUrl = vi.fn()
    useAppStore.setState({ setBackendUrl })
    render(<Settings open onClose={() => {}} />)

    const input = screen.getByLabelText('Backend URL')
    await userEvent.clear(input)
    await userEvent.type(input, 'http://localhost:9000')
    await userEvent.tab()

    expect(setBackendUrl).toHaveBeenCalledWith('http://localhost:9000')
  })

  it('resets the backend URL to the default', async () => {
    const setBackendUrl = vi.fn()
    useAppStore.setState({ backendUrl: 'http://localhost:9000', setBackendUrl })
    render(<Settings open onClose={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(setBackendUrl).toHaveBeenCalledWith(DEFAULT_BACKEND_HTTP_BASE_URL)
    expect(screen.getByLabelText('Backend URL')).toHaveValue(DEFAULT_BACKEND_HTTP_BASE_URL)
  })
})
