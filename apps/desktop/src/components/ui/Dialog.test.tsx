import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Delete file">
        <p>Are you sure?</p>
      </Dialog>,
    )
    expect(screen.queryByText('Delete file')).not.toBeInTheDocument()
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
  })

  it('renders the title, description, and children when open', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Delete file" description="This cannot be undone.">
        <p>Are you sure?</p>
      </Dialog>,
    )
    expect(screen.getByRole('heading', { name: 'Delete file' })).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('renders no description when none is given', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Delete file">
        <p>Are you sure?</p>
      </Dialog>,
    )
    expect(screen.queryByText('This cannot be undone.')).not.toBeInTheDocument()
  })

  it('renders a footer when given one', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Delete file" footer={<button type="button">Confirm</button>}>
        <p>Are you sure?</p>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Delete file">
        <p>Are you sure?</p>
      </Dialog>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Delete file">
        <p>Are you sure?</p>
      </Dialog>,
    )

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })
})
