export interface AgentBrowserViewProps {
  /** A `data:image/png;base64,...` URI — exactly what `browser_screenshot` (the agent tool,
   *  `app/agents/tools/browser_tools.py`) returns as its result. No separate WebSocket
   *  screenshot-streaming path exists: every tool result already reaches the desktop over the
   *  user's WS channel via the existing `agent_step` event pipeline (`AgentStepTimeline.tsx`
   *  reads it straight out of `agentStepsByTask`), so this component is purely presentational. */
  dataUri: string
}

/** Screenshot display for the agent's *own* headless Playwright browser (backend-side, Phase 13)
 *  — entirely separate from `BrowserPanel.tsx`'s interactive `WebContentsView`, which is the
 *  user's own browsing, never the agent's. */
export function AgentBrowserView({ dataUri }: AgentBrowserViewProps): JSX.Element {
  return (
    <div className="overflow-hidden rounded border border-border-subtle bg-bg-input">
      <img src={dataUri} alt="Agent browser screenshot" className="block w-full" />
    </div>
  )
}
