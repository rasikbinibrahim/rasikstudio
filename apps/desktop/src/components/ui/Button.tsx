import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent-primary text-text-inverse hover:bg-accent-hover',
  secondary: 'bg-bg-elevated border border-border hover:bg-bg-overlay text-text-primary',
  ghost: 'bg-transparent hover:bg-bg-overlay text-text-primary',
  danger: 'bg-status-error text-text-inverse',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'text-xs px-2 py-1 gap-1',
  md: 'text-sm px-3 py-1.5 gap-1.5',
  lg: 'text-base px-4 py-2 gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      className={[
        'inline-flex items-center justify-center rounded font-ui transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
