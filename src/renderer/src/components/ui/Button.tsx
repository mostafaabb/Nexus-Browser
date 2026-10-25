import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]',
  secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
  subtle: 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger/15 text-danger border border-danger/35 hover:bg-danger/25'
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-sm',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-md'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-100',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon buttons must always explain themselves. */
  label: string
  variant?: Variant
  size?: Size
  active?: boolean
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): React.JSX.Element {
  const dimensions = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors duration-100',
        'disabled:opacity-40 disabled:pointer-events-none',
        dimensions,
        VARIANTS[variant],
        active && 'bg-accent/20 text-accent',
        className
      )}
      {...rest}
    />
  )
}
