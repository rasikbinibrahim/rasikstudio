import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserPanel } from './BrowserPanel'
import type { BrowserViewState } from '../../types/browser'

function baseState(overrides: Partial<BrowserViewState> = {}): BrowserViewState {
  return { url: '', canGoBack: false, canGoForward: false, loading: false, title: '', ...overrides }
}

function stubBrowserApi(overrides: Record<string, unknown> = {}) {
  const api = {
    navigate: vi.fn(async () => ({ ok: true, data: null })),
    back: vi.fn(async () => ({ ok: true, data: null })),
    forward: vi.fn(async () => ({ ok: true, data: null })),
    reload: vi.fn(async () => ({ ok: true, data: null })),
    setBounds: vi.fn(),
    hide: vi.fn(),
    getState: vi.fn(async () => ({ ok: true, data: baseState() })),
    onStateChange: vi.fn(() => vi.fn()),
    ...overrides,
  }
  ;(window as unknown as { rasik: { browser: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    browser: api,
  }
  return api
}

describe('BrowserPanel', () => {
  beforeEach(() => {
    stubBrowserApi()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the current state and subscribes to state changes on mount', () => {
    const api = stubBrowserApi()

    render(<BrowserPanel />)

    expect(api.getState).toHaveBeenCalledOnce()
    expect(api.onStateChange).toHaveBeenCalledOnce()
  })

  it('back/forward buttons are disabled when the state says they cannot navigate', async () => {
    stubBrowserApi({
      getState: vi.fn(async () => ({ ok: true, data: baseState({ canGoBack: false, canGoForward: false }) })),
    })

    render(<BrowserPanel />)

    await waitFor(() => expect(screen.getByLabelText('Back')).toBeDisabled())
    expect(screen.getByLabelText('Forward')).toBeDisabled()
  })

  it('back/forward buttons enable once the state allows it', async () => {
    stubBrowserApi({
      getState: vi.fn(async () => ({ ok: true, data: baseState({ canGoBack: true, canGoForward: true }) })),
    })

    render(<BrowserPanel />)

    await waitFor(() => expect(screen.getByLabelText('Back')).not.toBeDisabled())
    expect(screen.getByLabelText('Forward')).not.toBeDisabled()
  })

  it('clicking Back/Forward/Reload calls the matching IPC method', async () => {
    const api = stubBrowserApi({
      getState: vi.fn(async () => ({ ok: true, data: baseState({ canGoBack: true, canGoForward: true }) })),
    })
    render(<BrowserPanel />)
    await waitFor(() => expect(screen.getByLabelText('Back')).not.toBeDisabled())

    await userEvent.click(screen.getByLabelText('Back'))
    await userEvent.click(screen.getByLabelText('Forward'))
    await userEvent.click(screen.getByLabelText('Reload'))

    expect(api.back).toHaveBeenCalledOnce()
    expect(api.forward).toHaveBeenCalledOnce()
    expect(api.reload).toHaveBeenCalledOnce()
  })

  it('typing a bare domain and pressing Enter navigates to an https:// URL', async () => {
    const api = stubBrowserApi()
    render(<BrowserPanel />)

    const input = screen.getByPlaceholderText('Enter a URL')
    await userEvent.type(input, 'example.com{Enter}')

    expect(api.navigate).toHaveBeenCalledWith('https://example.com')
  })

  it('typing a full URL with a scheme navigates to it unchanged', async () => {
    const api = stubBrowserApi()
    render(<BrowserPanel />)

    const input = screen.getByPlaceholderText('Enter a URL')
    await userEvent.type(input, 'http://localhost:3000{Enter}')

    expect(api.navigate).toHaveBeenCalledWith('http://localhost:3000')
  })

  it('reports its bounds to the main process on mount', () => {
    const api = stubBrowserApi()

    render(<BrowserPanel />)

    expect(api.setBounds).toHaveBeenCalled()
  })

  it('hides the native view on unmount', () => {
    const api = stubBrowserApi()
    const { unmount } = render(<BrowserPanel />)

    unmount()

    expect(api.hide).toHaveBeenCalledOnce()
  })

  it('the address bar reflects the navigated URL once state updates', async () => {
    let pushState: ((state: BrowserViewState) => void) | undefined
    const api = stubBrowserApi({
      onStateChange: vi.fn((handler: (state: BrowserViewState) => void) => {
        pushState = handler
        return vi.fn()
      }),
    })
    render(<BrowserPanel />)
    // Let the initial `getState()` promise actually resolve before pushing a new state — pushing
    // synchronously right after `render()` would race the still-pending initial fetch, which
    // could resolve *after* and clobber it back to empty.
    await waitFor(() => expect(api.getState).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))

    pushState?.(baseState({ url: 'https://example.com' }))

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Enter a URL')).toHaveValue('https://example.com'),
    )
  })
})
