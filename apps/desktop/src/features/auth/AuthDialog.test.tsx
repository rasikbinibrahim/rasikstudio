import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthDialog } from './AuthDialog'
import { useAppStore } from '../../store'

function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>): void {
  const fetchMock = vi.fn()
  for (const { ok, body } of responses) {
    fetchMock.mockImplementationOnce(async () => ({ ok, json: async () => body }))
  }
  vi.stubGlobal('fetch', fetchMock)
}

function stubAuthApi(): void {
  ;(window as unknown as { rasik: { auth: unknown } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    auth: {
      save: vi.fn(async () => ({ ok: true, data: true })),
      load: vi.fn(async () => ({ ok: true, data: null })),
      clear: vi.fn(async () => ({ ok: true, data: null })),
    },
  }
}

describe('AuthDialog', () => {
  beforeEach(() => {
    stubAuthApi()
    useAppStore.setState({ accessToken: null, refreshToken: null, user: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the login form by default, without a Name field', () => {
    render(<AuthDialog open onClose={vi.fn()} />)

    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('switches to the register form, showing a Name field', async () => {
    render(<AuthDialog open onClose={vi.fn()} />)

    await userEvent.click(screen.getByText("Don't have an account? Create one"))

    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  })

  it('signs in successfully: calls login, then /me, then stores the session and closes', async () => {
    mockFetchSequence([
      { ok: true, body: { access_token: 'tok', refresh_token: 'ref', token_type: 'bearer' } },
      { ok: true, body: { id: 'u1', email: 'alice@example.com', name: 'Alice' } },
    ])
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)

    await userEvent.type(screen.getByPlaceholderText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(useAppStore.getState().accessToken).toBe('tok')
    expect(useAppStore.getState().user).toEqual({ id: 'u1', email: 'alice@example.com', name: 'Alice' })
  })

  it('shows the backend error message and does not close on failed login', async () => {
    mockFetchSequence([{ ok: false, body: { error: { message: 'Invalid email or password' } } }])
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)

    await userEvent.type(screen.getByPlaceholderText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(useAppStore.getState().accessToken).toBeNull()
  })

  it('closes without making any network call when Cancel is clicked', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<AuthDialog open onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
