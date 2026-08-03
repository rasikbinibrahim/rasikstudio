/// <reference types="vite/client" />

import type { RasikApi } from '../electron/preload/index'

declare global {
  interface Window {
    rasik: RasikApi
  }
}
