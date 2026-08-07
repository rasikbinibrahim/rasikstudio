import { type BrowserWindow, session, WebContentsView } from 'electron'
import type { BrowserViewBounds, BrowserViewState } from '../../src/types/browser'

export type { BrowserViewBounds, BrowserViewState } from '../../src/types/browser'

const EMPTY_STATE: BrowserViewState = { url: '', canGoBack: false, canGoForward: false, loading: false, title: '' }

// A separate session partition from the app's default one, per `phase-13-browser.md`'s
// "Interactive browser uses separate session partition" acceptance criterion — cookies/storage
// from general web browsing never mix with anything the app's own renderer (or, later, any
// authenticated backend session) uses.
const PARTITION = 'persist:browser'

/** Manages the single interactive `WebContentsView` (Electron's `BrowserView` successor) that
 *  backs the desktop Browser panel. A `WebContentsView` is a native, compositor-drawn overlay
 *  positioned by the main process — it isn't a DOM element the renderer can host directly, which
 *  is why `BrowserPanel.tsx` only ever sends bounds (from its own placeholder `<div>`'s
 *  `getBoundingClientRect()`) rather than rendering the browser content itself. One instance for
 *  the app's lifetime — this project has no multi-window support yet (same single-window
 *  assumption `PtyManager.broadcast()` already documents), so there is exactly one browser view
 *  to manage, not one per window. */
export class BrowserViewManager {
  private window: BrowserWindow | null = null
  private view: WebContentsView | null = null
  private onStateChange: ((state: BrowserViewState) => void) | null = null

  attachToWindow(window: BrowserWindow): void {
    this.window = window
    window.once('closed', () => {
      this.view = null
      this.window = null
    })
  }

  setStateChangeListener(listener: ((state: BrowserViewState) => void) | null): void {
    this.onStateChange = listener
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view
    if (!this.window) {
      throw new Error('BrowserViewManager is not attached to a window yet')
    }

    const view = new WebContentsView({
      webPreferences: {
        session: session.fromPartition(PARTITION),
        contextIsolation: true,
        sandbox: true,
      },
    })
    this.window.contentView.addChildView(view)
    // Zero-size until the renderer's placeholder `<div>` reports real bounds via `setBounds()` —
    // otherwise the view would briefly render at its default (0,0,0,0) origin/size, which on some
    // platforms still paints a visible sliver before the first real bounds update lands.
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    const emitState = (): void => this.emitState()
    view.webContents.on('did-navigate', emitState)
    view.webContents.on('did-navigate-in-page', emitState)
    view.webContents.on('did-start-loading', emitState)
    view.webContents.on('did-stop-loading', emitState)
    view.webContents.on('page-title-updated', emitState)

    this.view = view
    return view
  }

  private emitState(): void {
    if (!this.onStateChange) return
    this.onStateChange(this.getState())
  }

  async navigate(url: string): Promise<void> {
    const view = this.ensureView()
    await view.webContents.loadURL(url)
  }

  goBack(): void {
    const { navigationHistory } = this.ensureView().webContents
    if (navigationHistory.canGoBack()) navigationHistory.goBack()
  }

  goForward(): void {
    const { navigationHistory } = this.ensureView().webContents
    if (navigationHistory.canGoForward()) navigationHistory.goForward()
  }

  reload(): void {
    this.ensureView().webContents.reload()
  }

  setBounds(bounds: BrowserViewBounds): void {
    this.ensureView().setBounds(bounds)
  }

  /** Called when the Browser panel isn't the visible sidebar view — collapses the view to
   *  zero-size rather than removing it from `contentView`, so its `WebContents` (and whatever
   *  page it has loaded) stays alive and just resumes where it was when the panel is shown again. */
  hide(): void {
    if (!this.view) return
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  }

  getState(): BrowserViewState {
    if (!this.view) return EMPTY_STATE
    const { webContents } = this.view
    return {
      url: webContents.getURL(),
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward(),
      loading: webContents.isLoading(),
      title: webContents.getTitle(),
    }
  }

  destroy(): void {
    if (this.view && this.window) {
      this.window.contentView.removeChildView(this.view)
    }
    this.view = null
  }
}

// One instance for the app's lifetime, same convention as `pty-manager.ts`'s `ptyManager` —
// `index.ts` attaches it to the real window; `ipc/browser-handlers.ts` calls its methods.
export const browserViewManager = new BrowserViewManager()
