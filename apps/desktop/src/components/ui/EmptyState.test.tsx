import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="No workspace open" />)
    expect(screen.getByText('No workspace open')).toBeInTheDocument()
  })

  it('renders no extra children when none are given', () => {
    const { container } = render(<EmptyState message="No workspace open" />)
    expect(container.querySelector('span')?.nextSibling).toBeNull()
  })

  it('renders children below the message when given', () => {
    render(
      <EmptyState message="No sessions yet">
        <button type="button">New Chat</button>
      </EmptyState>,
    )
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Chat' })).toBeInTheDocument()
  })
})
