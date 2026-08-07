import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders nothing for a zero or negative count', () => {
    const { container: zero } = render(<Badge count={0} />)
    expect(zero).toBeEmptyDOMElement()

    const { container: negative } = render(<Badge count={-1} />)
    expect(negative).toBeEmptyDOMElement()
  })

  it('renders the count as text', () => {
    render(<Badge count={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('caps the label at max, appending a "+"', () => {
    render(<Badge count={150} max={99} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('shows the exact count when it does not exceed max', () => {
    render(<Badge count={99} max={99} />)
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('applies the error variant color class', () => {
    render(<Badge count={3} variant="error" />)
    expect(screen.getByText('3')).toHaveClass('bg-status-error')
  })

  it('applies the default variant color class', () => {
    render(<Badge count={3} />)
    expect(screen.getByText('3')).toHaveClass('bg-accent-primary')
  })
})
