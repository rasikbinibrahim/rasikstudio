import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input', () => {
  it('renders the current value', () => {
    render(<Input value="hello" onChange={() => {}} />)
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument()
  })

  it('calls onChange with the new value as the user types', async () => {
    const onChange = vi.fn()
    render(<Input value="" onChange={onChange} placeholder="Search…" />)

    await userEvent.type(screen.getByPlaceholderText('Search…'), 'x')

    expect(onChange).toHaveBeenCalledWith('x')
  })

  it('shows the error message and marks the input aria-invalid', () => {
    render(<Input value="" onChange={() => {}} error="Required" />)

    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('disables the input when disabled is set', () => {
    render(<Input value="" onChange={() => {}} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('renders prefix and suffix content', () => {
    render(<Input value="" onChange={() => {}} prefix={<span>$</span>} suffix={<span>USD</span>} />)
    expect(screen.getByText('$')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
  })
})
