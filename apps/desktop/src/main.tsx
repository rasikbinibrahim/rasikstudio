import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { readPersistedTheme } from './lib/theme-storage'
import './styles/global.css'

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
