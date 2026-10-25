import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface PageShellProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  /** Removes the internal padding for edge-to-edge content. */
  flush?: boolean
}

/** Common frame for the internal `nexus://` pages. */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
  flush
}: PageShellProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="truncate text-[11.5px] text-ink-subtle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('nx-scroll min-h-0 flex-1', flush ? '' : 'p-5')}>{children}</div>
    </div>
  )
}
