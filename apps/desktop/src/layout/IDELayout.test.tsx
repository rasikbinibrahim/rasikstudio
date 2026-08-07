import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../store'
import { IDELayout } from './IDELayout'

describe('IDELayout', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarCollapsed: false, bottomPanelCollapsed: false })
  })

  it('renders the sidebar, editor, and bottom panel content when neither is collapsed', () => {
    render(<IDELayout sidebar={<div>sidebar content</div>} editor={<div>editor content</div>} bottomPanel={<div>bottom content</div>} />)

    expect(screen.getByText('sidebar content')).toBeInTheDocument()
    expect(screen.getByText('editor content')).toBeInTheDocument()
    expect(screen.getByText('bottom content')).toBeInTheDocument()
  })

  it('omits the sidebar when sidebarCollapsed is true', () => {
    useAppStore.setState({ sidebarCollapsed: true })
    render(<IDELayout sidebar={<div>sidebar content</div>} editor={<div>editor content</div>} bottomPanel={<div>bottom content</div>} />)

    expect(screen.queryByText('sidebar content')).not.toBeInTheDocument()
    expect(screen.getByText('editor content')).toBeInTheDocument()
  })

  it('omits the bottom panel when bottomPanelCollapsed is true', () => {
    useAppStore.setState({ bottomPanelCollapsed: true })
    render(<IDELayout sidebar={<div>sidebar content</div>} editor={<div>editor content</div>} bottomPanel={<div>bottom content</div>} />)

    expect(screen.queryByText('bottom content')).not.toBeInTheDocument()
    expect(screen.getByText('editor content')).toBeInTheDocument()
  })

  it('always renders the status bar', () => {
    useAppStore.setState({ workspaceName: 'my-project' })
    render(<IDELayout sidebar={null} editor={<div />} bottomPanel={<div />} />)

    expect(screen.getByText('my-project')).toBeInTheDocument()
  })
})
