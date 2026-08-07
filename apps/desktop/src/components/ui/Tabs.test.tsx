import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs } from './Tabs'

const tabs = [
  { id: 'a', label: 'File A', closeable: true },
  { id: 'b', label: 'File B', closeable: true },
]

describe('Tabs', () => {
  it('renders every tab label', () => {
    render(<Tabs tabs={tabs} activeId="a" onTabChange={() => {}} />)
    expect(screen.getByText('File A')).toBeInTheDocument()
    expect(screen.getByText('File B')).toBeInTheDocument()
  })

  it('marks the active tab as selected', () => {
    render(<Tabs tabs={tabs} activeId="b" onTabChange={() => {}} />)
    expect(screen.getByText('File B').closest('[role="tab"]')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('File A').closest('[role="tab"]')).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onTabChange when a tab is clicked', async () => {
    const onTabChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="a" onTabChange={onTabChange} />)

    await userEvent.click(screen.getByText('File B'))

    expect(onTabChange).toHaveBeenCalledWith('b')
  })

  it('calls onTabClose without triggering onTabChange', async () => {
    const onTabChange = vi.fn()
    const onTabClose = vi.fn()
    render(
      <Tabs tabs={tabs} activeId="a" onTabChange={onTabChange} onTabClose={onTabClose} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close File B' }))

    expect(onTabClose).toHaveBeenCalledWith('b')
    expect(onTabChange).not.toHaveBeenCalled()
  })
})
