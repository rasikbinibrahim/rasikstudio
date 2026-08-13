import { useState } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store'
import { DEFAULT_BACKEND_HTTP_BASE_URL } from '../../lib/backend-config'
import { MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from '../../store/settings-slice'
import { OllamaModelsSection } from './OllamaModelsSection'

export interface SettingsProps {
  open: boolean
  onClose: () => void
}

/** `phase-03-desktop-application-shell.md`'s deferred "full Settings UI panel" item — before
 *  this, the theme toggle (via the command palette / native menu) was the only setting exposed
 *  anywhere, per `TASKS.md`. Every field here writes straight to the same store actions/localStorage
 *  helpers the command-palette theme toggle and `MonacoEditor.tsx` already used — this is a UI
 *  in front of settings that already worked, not a new settings system. */
export function Settings({ open, onClose }: SettingsProps): JSX.Element {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const editorFontSize = useAppStore((state) => state.editorFontSize)
  const setEditorFontSize = useAppStore((state) => state.setEditorFontSize)
  const editorWordWrap = useAppStore((state) => state.editorWordWrap)
  const setEditorWordWrap = useAppStore((state) => state.setEditorWordWrap)
  const backendUrl = useAppStore((state) => state.backendUrl)
  const setBackendUrl = useAppStore((state) => state.setBackendUrl)
  const accessToken = useAppStore((state) => state.accessToken)

  const [backendUrlDraft, setBackendUrlDraft] = useState(backendUrl)

  return (
    <Dialog open={open} onClose={onClose} title="Settings" size="md">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Appearance
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">Theme</span>
            <div className="flex gap-1">
              <Button
                variant={theme === 'dark' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                Dark
              </Button>
              <Button
                variant={theme === 'light' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                Light
              </Button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Editor</h3>
          <div className="flex items-center justify-between">
            <label htmlFor="editor-font-size" className="text-sm text-text-primary">
              Font size
            </label>
            <input
              id="editor-font-size"
              type="number"
              min={MIN_EDITOR_FONT_SIZE}
              max={MAX_EDITOR_FONT_SIZE}
              value={editorFontSize}
              onChange={(event) => setEditorFontSize(Number(event.target.value))}
              className="w-16 rounded border border-border-default bg-bg-input px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="editor-word-wrap" className="text-sm text-text-primary">
              Word wrap
            </label>
            <input
              id="editor-word-wrap"
              type="checkbox"
              checked={editorWordWrap}
              onChange={(event) => setEditorWordWrap(event.target.checked)}
              className="h-4 w-4 accent-accent-primary"
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Backend</h3>
          <div className="flex flex-col gap-1">
            <label htmlFor="backend-url" className="text-sm text-text-primary">
              Backend URL
            </label>
            <div className="flex gap-1.5">
              <input
                id="backend-url"
                type="text"
                value={backendUrlDraft}
                onChange={(event) => setBackendUrlDraft(event.target.value)}
                onBlur={() => setBackendUrl(backendUrlDraft)}
                placeholder={DEFAULT_BACKEND_HTTP_BASE_URL}
                className="flex-1 rounded border border-border-default bg-bg-input px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setBackendUrl(DEFAULT_BACKEND_HTTP_BASE_URL)
                  setBackendUrlDraft(DEFAULT_BACKEND_HTTP_BASE_URL)
                }}
              >
                Reset
              </Button>
            </div>
            <span className="text-xs text-text-secondary">
              Where the desktop app looks for the Rasik Studio backend. Changing this reconnects
              REST calls immediately; an already-open WebSocket reconnects the next time a
              workspace is opened.
            </span>
          </div>
        </section>

        {accessToken && <OllamaModelsSection />}
      </div>
    </Dialog>
  )
}
