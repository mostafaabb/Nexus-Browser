import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-ink-muted',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger'
}

export function Badge({
  children,
  tone = 'neutral',
  className
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'nx-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-line-strong border-t-accent',
        className
      )}
    />
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-ink-subtle">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12px] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
      {children}
    </p>
  )
}

export function SectionTitle({
  children,
  action
}: {
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {children}
      </h3>
      {action}
    </div>
  )
}
