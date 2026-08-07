import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeNavigationHistory {
  canGoBack = vi.fn(() => false)
  canGoForward = vi.fn(() => false)
  goBack = vi.fn()
  goForward = vi.fn()
}

class FakeWebContents {
  private listeners = new Map<string, Array<() => void>>()
  url = ''
  title = ''
  loading = false
  navigationHistory = new FakeNavigationHistory()
  loadURL = vi.fn(async (url: string) => {
    this.url = url
  })
  reload = vi.fn()
  getURL = vi.fn(() => this.url)
  getTitle = vi.fn(() => this.title)
  isLoading = vi.fn(() => this.loading)

  on(event: string, handler: () => void): void {
    const handlers = this.listeners.get(event) ?? []
    handlers.push(handler)
    this.listeners.set(event, handlers)
  }

  emit(event: string): void {
    for (const handler of this.listeners.get(event) ?? []) handler()
  }
}

class FakeWebContentsView {
  webContents = new FakeWebContents()
  setBounds = vi.fn()
}

let lastCreatedView: FakeWebContentsView | null = null
const fromPartitionMock = vi.fn<(...args: unknown[]) => { partition: string }>(() => ({
  partition: 'fake-session',
}))

vi.mock('electron', () => ({
  WebContentsView: vi.fn(function (this: unknown) {
    lastCreatedView = new FakeWebContentsView()
    return lastCreatedView
  }),
  session: { fromPartition: (...args: unknown[]) => fromPartitionMock(...args) },
}))

function fakeWindow() {
  return {
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    once: vi.fn(),
  }
}

describe('BrowserViewManager', () => {
  let BrowserViewManager: typeof import('./browser-view').BrowserViewManager

  beforeEach(async () => {
    vi.clearAllMocks()
    lastCreatedView = null
    ;({ BrowserViewManager } = await import('./browser-view'))
  })

  it('throws if navigate() is called before attaching to a window', async () => {
    const manager = new BrowserViewManager()

    await expect(manager.navigate('https://example.com')).rejects.toThrow(/not attached/)
  })

  it('creates the WebContentsView on the persist:browser partition on first use', async () => {
    const manager = new BrowserViewManager()
    const window = fakeWindow()
    manager.attachToWindow(window as never)

    await manager.navigate('https://example.com')

    expect(fromPartitionMock).toHaveBeenCalledWith('persist:browser')
    expect(window.contentView.addChildView).toHaveBeenCalledOnce()
  })

  it('reuses the same view across multiple calls instead of recreating it', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)

    await manager.navigate('https://a.example')
    const firstView = lastCreatedView
    await manager.navigate('https://b.example')

    expect(lastCreatedView).toBe(firstView)
  })

  it('navigate() calls loadURL with the given url', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)

    await manager.navigate('https://example.com')

    expect(lastCreatedView?.webContents.loadURL).toHaveBeenCalledWith('https://example.com')
  })

  it('goBack() only calls navigationHistory.goBack() when canGoBack is true', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')
    const view = lastCreatedView!

    view.webContents.navigationHistory.canGoBack.mockReturnValue(false)
    manager.goBack()
    expect(view.webContents.navigationHistory.goBack).not.toHaveBeenCalled()

    view.webContents.navigationHistory.canGoBack.mockReturnValue(true)
    manager.goBack()
    expect(view.webContents.navigationHistory.goBack).toHaveBeenCalledOnce()
  })

  it('goForward() only calls navigationHistory.goForward() when canGoForward is true', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')
    const view = lastCreatedView!

    view.webContents.navigationHistory.canGoForward.mockReturnValue(true)
    manager.goForward()

    expect(view.webContents.navigationHistory.goForward).toHaveBeenCalledOnce()
  })

  it('reload() calls webContents.reload()', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')

    manager.reload()

    expect(lastCreatedView?.webContents.reload).toHaveBeenCalledOnce()
  })

  it('setBounds() forwards the bounds to the view', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')

    manager.setBounds({ x: 1, y: 2, width: 300, height: 400 })

    expect(lastCreatedView?.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 400 })
  })

  it('hide() collapses the view to zero size', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')

    manager.hide()

    expect(lastCreatedView?.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('hide() before any view exists is a no-op, not a throw', () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)

    expect(() => manager.hide()).not.toThrow()
  })

  it('getState() returns an empty state before any view has been created', () => {
    const manager = new BrowserViewManager()

    expect(manager.getState()).toEqual({
      url: '',
      canGoBack: false,
      canGoForward: false,
      loading: false,
      title: '',
    })
  })

  it('getState() reflects the real webContents state once a view exists', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    await manager.navigate('https://example.com')
    const view = lastCreatedView!
    view.webContents.title = 'Example'
    view.webContents.loading = true
    view.webContents.navigationHistory.canGoBack.mockReturnValue(true)

    const state = manager.getState()

    expect(state).toEqual({
      url: 'https://example.com',
      canGoBack: true,
      canGoForward: false,
      loading: true,
      title: 'Example',
    })
  })

  it('the state-change listener fires on did-navigate with the current state', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    const onStateChange = vi.fn()
    manager.setStateChangeListener(onStateChange)
    await manager.navigate('https://example.com')
    const view = lastCreatedView!
    onStateChange.mockClear()

    view.webContents.emit('did-navigate')

    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com' }))
  })

  it('the state-change listener fires on did-start-loading and did-stop-loading', async () => {
    const manager = new BrowserViewManager()
    manager.attachToWindow(fakeWindow() as never)
    const onStateChange = vi.fn()
    manager.setStateChangeListener(onStateChange)
    await manager.navigate('https://example.com')
    const view = lastCreatedView!
    onStateChange.mockClear()

    view.webContents.emit('did-start-loading')
    view.webContents.emit('did-stop-loading')
    view.webContents.emit('page-title-updated')

    expect(onStateChange).toHaveBeenCalledTimes(3)
  })

  it('destroy() removes the child view from the window and resets state to empty', async () => {
    const manager = new BrowserViewManager()
    const window = fakeWindow()
    manager.attachToWindow(window as never)
    await manager.navigate('https://example.com')
    const view = lastCreatedView

    manager.destroy()

    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(manager.getState()).toEqual({
      url: '',
      canGoBack: false,
      canGoForward: false,
      loading: false,
      title: '',
    })
  })
})
