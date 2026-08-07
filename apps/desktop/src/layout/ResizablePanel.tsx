import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type PanelGroupProps,
  type PanelProps,
} from 'react-resizable-panels'

export function ResizablePanelGroup(props: PanelGroupProps): JSX.Element {
  return <PanelGroup {...props} />
}

export function ResizablePanel(props: PanelProps): JSX.Element {
  return <Panel {...props} />
}

export function ResizeHandle(): JSX.Element {
  return (
    <PanelResizeHandle
      className={[
        'bg-border-subtle transition-colors hover:bg-accent-primary',
        'data-[resize-handle-state=drag]:bg-accent-primary',
        'data-[panel-group-direction=horizontal]:w-px',
        'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
      ].join(' ')}
    />
  )
}
