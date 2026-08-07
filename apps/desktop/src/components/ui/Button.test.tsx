import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled while loading', () => {
    render(<Button loading>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onClick).not.toHaveBeenCalled()
  })
})
