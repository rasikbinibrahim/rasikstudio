// Design-only example — `@rasik-studio/plugin-api` doesn't exist yet (see this directory's own
// README.md). Written against `../../API_REFERENCE.md`'s planned `PluginAPI` shape so a future
// plugin runtime implementation has a concrete, correct target to validate against.
import type { PluginAPI } from '@rasik-studio/plugin-api'

export function activate(api: PluginAPI): void {
  api.commands.register('hello-world.explain', async () => {
    const text = await api.editor.getSelectedText()
    if (!text) {
      api.ui.showMessage('Select some code first.', 'warning')
      return
    }

    const result = await api.ai.chat([{ role: 'user', content: `Explain this: ${text}` }])
    api.ui.showMessage(result, 'info')
  })
}

export function deactivate(): void {
  // Disposables returned from `api.commands.register()` are cleaned up automatically on
  // deactivate — nothing to do here for this plugin.
}
