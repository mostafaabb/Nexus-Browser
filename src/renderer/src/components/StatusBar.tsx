import { CircleCheck, Globe, Lock, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useAppStore } from '../store/app-store'

/** A slim status line at the bottom of the window. */
export function StatusBar(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const info = useAppStore((state) => state.info)
  const panel = useAppStore((state) => state.panel)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  // A fresh tab has an empty `url` but a `pendingUrl`; the empty string is a
  // valid value here, so the fallback must use `||` and not `??`.
  const url = activeTab?.url || activeTab?.pendingUrl || ''
  const isInternal = url.startsWith('nexus://')
  const isSecure = url.startsWith('https://')
  const hasError = activeTab?.status === 'error'

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-3 border-t border-line bg-bg-elevated px-2.5 text-[11px] text-ink-subtle">
      <span className="flex min-w-0 items-center gap-1.5">
        {hasError ? (
          <TriangleAlert className="h-3 w-3 shrink-0 text-danger" />
        ) : isInternal ? (
          <Globe className="h-3 w-3 shrink-0" />
        ) : isSecure ? (
          <Lock className="h-3 w-3 shrink-0 text-success" />
        ) : url ? (
          <ShieldAlert className="h-3 w-3 shrink-0 text-warning" />
        ) : (
          <CircleCheck className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{url || 'nexus://start'}</span>
      </span>

      <span className="flex-1" />

      {activeTab?.error ? (
        <span className="max-w-[45%] truncate text-danger">{activeTab.error}</span>
      ) : null}

      <span>
        {tabs.length} tab{tabs.length === 1 ? '' : 's'}
      </span>

      {panel ? <span className="capitalize">{panel}</span> : null}

      <span className="tabular-nums">Zoom {Math.round((activeTab?.zoomFactor ?? 1) * 100)}%</span>

      <span className="hidden sm:inline">
        {info ? `${info.name} ${info.version}` : 'Nexus Browser'}
      </span>
    </footer>
  )
}
