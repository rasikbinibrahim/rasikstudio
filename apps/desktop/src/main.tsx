import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useAppStore } from './store'
import { readPersistedTheme } from './lib/theme-storage'
import './styles/global.css'

// E2E test hook (`tests/e2e/fixtures/electron-app.ts`'s `openWorkspace()`, type declared in
// `types/test-hooks.d.ts`) — lets Playwright drive real store actions (e.g. `openFolderAtPath()`,
// the same code path drag-and-drop uses) without fighting a native OS file-picker dialog, which
// isn't automatable. Exposed unconditionally rather than dev-only: `contextIsolation: true` +
// `script-src 'self'` already mean the renderer only ever runs this app's own bundled code (see
// `SECURITY_GUIDELINES.md`), so a global on `window` here doesn't cross any real trust boundary
// the way it would on a public website — it's a module-level singleton at the same trust level
// as everything else in this bundle, just reachable from the DevTools console/Playwright too.
window.__rasikTestStore = useAppStore

// Applied synchronously, before the first paint, to avoid a flash of the wrong theme —
// useTheme() only keeps `data-theme` in sync with later changes, it doesn't set the initial value.
document.documentElement.setAttribute('data-theme', readPersistedTheme())

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
