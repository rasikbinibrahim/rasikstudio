export interface BrowserViewState {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  title: string
}

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}
