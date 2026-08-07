export interface BadgeProps {
  count: number
  variant?: 'default' | 'error'
  max?: number
}

export function Badge({ count, variant = 'default', max = 99 }: BadgeProps): JSX.Element | null {
  if (count <= 0) return null
  const label = count > max ? `${max}+` : String(count)

  return (
    <span
      className={[
        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
        'text-[10px] font-semibold leading-none text-text-inverse',
        variant === 'error' ? 'bg-status-error' : 'bg-accent-primary',
      ].join(' ')}
    >
      {label}
    </span>
  )
}
