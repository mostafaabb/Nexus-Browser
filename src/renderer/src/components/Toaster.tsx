import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { IconButton } from './ui/Button'
import { cn } from '../lib/cn'

/**
 * Transient notifications.
 *
 * The host sits in the application chrome (below the content area) because the
 * native website views are composited on top of the renderer — anything drawn
 * inside the content region would be hidden by them.
 */
export function Toaster(): React.JSX.Element | null {
  const toasts = useAppStore((state) => state.toasts)
  const dismissToast = useAppStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="nx-animate-in flex shrink-0 flex-col gap-1 border-t border-line bg-bg-elevated px-2 py-1.5"
    >
      {toasts.slice(-3).map((toast) => {
        const Icon =
          toast.tone === 'error' ? TriangleAlert : toast.tone === 'success' ? CircleCheck : Info
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1 text-[12px]',
              toast.tone === 'error'
                ? 'bg-danger/10 text-danger'
                : toast.tone === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-surface-2 text-ink-muted'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{toast.message}</span>
            <IconButton label="Dismiss" size="sm" onClick={() => dismissToast(toast.id)}>
              <X className="h-3 w-3" />
            </IconButton>
          </div>
        )
      })}
    </div>
  )
}
