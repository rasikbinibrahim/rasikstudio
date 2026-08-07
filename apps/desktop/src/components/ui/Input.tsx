import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'> {
  value: string
  onChange: (value: string) => void
  error?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export function Input({
  value,
  onChange,
  placeholder,
  disabled,
  error,
  prefix,
  suffix,
  className = '',
  id,
  ...rest
}: InputProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={[
          'flex items-center gap-2 rounded border bg-bg-input px-2 py-1.5',
          'focus-within:ring-2 focus-within:ring-accent-primary focus-within:ring-offset-0',
          error ? 'border-status-error' : 'border-border-default',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      >
        {prefix}
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={[
            'w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none',
            className,
          ].join(' ')}
          {...rest}
        />
        {suffix}
      </div>
      {error && <span className="text-xs text-status-error">{error}</span>}
    </div>
  )
}
