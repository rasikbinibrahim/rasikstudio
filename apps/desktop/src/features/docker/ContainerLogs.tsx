import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store'

export interface ContainerLogsProps {
  containerId: string
}

/** Subscribes to the selected container's `docker logs -f` stream for as long as it's mounted —
 *  `docker-slice.ts`'s `selectContainer()` starts/stops the underlying main-process stream, this
 *  component only wires the IPC data events into the store, same division of responsibility
 *  `useTerminal.ts` establishes for PTY output. */
export function ContainerLogs({ containerId }: ContainerLogsProps): JSX.Element {
  const logs = useAppStore((state) => state.dockerLogs)
  const streaming = useAppStore((state) => state.dockerLogsStreaming)
  const handleLogData = useAppStore((state) => state.handleLogData)
  const handleLogClosed = useAppStore((state) => state.handleLogClosed)
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const unsubscribeData = window.rasik.docker.onLogData(containerId, handleLogData)
    const unsubscribeClosed = window.rasik.docker.onLogClosed(containerId, handleLogClosed)
    return () => {
      unsubscribeData()
      unsubscribeClosed()
    }
  }, [containerId, handleLogData, handleLogClosed])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <div className="flex h-40 flex-col border-t border-border-subtle">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-text-secondary">
        <span>Logs</span>
        <span>{streaming ? 'streaming…' : 'stopped'}</span>
      </div>
      <pre
        ref={scrollRef}
        className="flex-1 overflow-auto whitespace-pre-wrap break-all bg-bg-base px-3 py-1 font-mono text-xs text-text-primary"
      >
        {logs || 'No log output yet.'}
      </pre>
    </div>
  )
}
