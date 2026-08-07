import type { RasikApi } from '../../electron/preload/index'

/** Single typed entry point to `window.rasik.*` — no other hook may call it directly. */
export function useIpc(): RasikApi {
  return window.rasik
}
