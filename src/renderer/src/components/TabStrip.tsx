import { useMemo, useRef, useState } from 'react'
import { Copy, Globe, Pin, PinOff, Plus, Volume2, VolumeX, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { IconButton } from './ui/Button'
import { Menu, type MenuItem } from './ui/Menu'
import { cn } from '../lib/cn'
import { nexus } from '../lib/api'
import { isInternalUrl } from '@shared/navigation/url'

interface ContextState {
  x: number
  y: number
  tabId: string
}

export function TabStrip(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activateTab = useAppStore((state) => state.activateTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const createTab = useAppStore((state) => state.createTab)
  const [context, setContext] = useState<ContextState | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const visibleTabs = useMemo(() => {
    // The order comes from the main process, which owns the tab order. Only
    // pinned tabs are moved to the front; the relative order is preserved.
    const filtered = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
    const pinned = filtered.filter((tab) => tab.pinned)
    const rest = filtered.filter((tab) => !tab.pinned)
    return [...pinned, ...rest]
  }, [tabs, activeWorkspaceId])

  const menuItems = useMemo((): MenuItem[] => {
    if (!context) return []
    const tab = tabs.find((item) => item.id === context.tabId)
    if (!tab) return []
    return [
      {
        id: 'duplicate',
        label: 'Duplicate tab',
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => void nexus.tabs.duplicate(tab.id)
      },
      {
        id: 'pin',
        label: tab.pinned ? 'Unpin tab' : 'Pin tab',
        icon: tab.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />,
        onSelect: () => void nexus.tabs.setPinned(tab.id, !tab.pinned)
      },
      {
        id: 'mute',
        label: tab.muted ? 'Unmute tab' : 'Mute tab',
        icon: tab.muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />,
        onSelect: () => void nexus.tabs.setMuted(tab.id, !tab.muted)
      },
      {
        id: 'close',
        label: 'Close tab',
        icon: <X className="h-3.5 w-3.5" />,
        danger: true,
        separatorBefore: true,
        onSelect: () => void closeTab(tab.id)
      }
    ]
  }, [context, tabs, closeTab])

  const commitReorder = (targetIndex: number): void => {
    if (!dragId) return
    const ids = visibleTabs.map((tab) => tab.id)
    const from = ids.indexOf(dragId)
    if (from < 0) {
      setDragId(null)
      setDropIndex(null)
      return
    }
    ids.splice(from, 1)
    const insertAt = Math.max(0, Math.min(targetIndex, ids.length))
    ids.splice(insertAt, 0, dragId)
    void nexus.tabs.reorder(ids)
    setDragId(null)
    setDropIndex(null)
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-line bg-bg-elevated px-1.5">
      <div ref={stripRef} className="nx-scroll flex flex-1 items-stretch gap-1 overflow-x-auto">
        {visibleTabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const internal = isInternalUrl(tab.url || tab.pendingUrl || '')
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => setDragId(tab.id)}
              onDragOver={(event) => {
                event.preventDefault()
                setDropIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                commitReorder(index)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropIndex(null)
              }}
              onClick={() => void activateTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  void closeTab(tab.id)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setContext({ x: event.clientX, y: event.clientY, tabId: tab.id })
              }}
              title={tab.url || tab.pendingUrl || tab.title}
              className={cn(
                'group flex max-w-[220px] min-w-[110px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 transition-colors duration-100',
                isActive
                  ? 'border-line bg-surface text-ink'
                  : 'border-transparent bg-transparent text-ink-muted hover:bg-surface/60 hover:text-ink',
                dropIndex === index && dragId && dragId !== tab.id && 'ring-1 ring-accent'
              )}
            >
              {tab.pinned ? (
                <Pin className="h-3 w-3 shrink-0 text-ink-subtle" />
              ) : internal ? (
                <Globe className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
              ) : tab.faviconUrl ? (
                <img
                  src={tab.faviconUrl}
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 rounded-sm"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Globe className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
              )}

              <span className="min-w-0 flex-1 truncate text-[12px]">{tab.title || 'New Tab'}</span>

              {tab.loading ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-line-strong border-t-accent nx-spin" />
              ) : null}
              {tab.audible && !tab.muted ? (
                <Volume2 className="h-3 w-3 shrink-0 text-ink-subtle" />
              ) : null}
              {tab.muted ? <VolumeX className="h-3 w-3 shrink-0 text-ink-subtle" /> : null}

              <button
                type="button"
                aria-label={`Close ${tab.title || 'tab'}`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink group-hover:opacity-100 focus:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  void closeTab(tab.id)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center pr-1">
        <IconButton label="New tab" size="sm" onClick={() => void createTab()}>
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>

      {context ? (
        <Menu items={menuItems} x={context.x} y={context.y} onClose={() => setContext(null)} />
      ) : null}
    </div>
  )
}
