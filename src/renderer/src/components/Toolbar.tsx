import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Check,
  Copy,
  Ellipsis,
  PanelLeft,
  Printer,
  RotateCw,
  ScanText,
  Sparkles,
  Square,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { AddressBar } from './AddressBar'
import { IconButton } from './ui/Button'
import { Menu, type MenuItem } from './ui/Menu'
import { useAppStore } from '../store/app-store'
import { nexus, errorMessage } from '../lib/api'

export function Toolbar(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const goBack = useAppStore((state) => state.goBack)
  const goForward = useAppStore((state) => state.goForward)
  const reload = useAppStore((state) => state.reload)
  const toggleAi = useAppStore((state) => state.toggleAi)
  const aiOpen = useAppStore((state) => state.aiOpen)
  const toggleFind = useAppStore((state) => state.toggleFind)
  const panel = useAppStore((state) => state.panel)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const pushToast = useAppStore((state) => state.pushToast)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [bookmarked, setBookmarked] = useState(false)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const canGoBack = activeTab?.canGoBack ?? false
  const canGoForward = activeTab?.canGoForward ?? false
  const isLoading = activeTab?.loading ?? false
  const isInternal = (activeTab?.url ?? '').startsWith('nexus://')

  const bookmarkCurrent = async (): Promise<void> => {
    if (!activeTab || isInternal || !activeTab.url) return
    try {
      await nexus.bookmarks.create(activeTab.title || activeTab.url, activeTab.url)
      setBookmarked(true)
      window.setTimeout(() => setBookmarked(false), 1800)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const menuItems: MenuItem[] = [
    {
      id: 'new-tab',
      label: 'New tab',
      onSelect: () => void useAppStore.getState().createTab()
    },
    {
      id: 'print',
      label: 'Print…',
      icon: <Printer className="h-3.5 w-3.5" />,
      disabled: !activeTab || isInternal,
      onSelect: () => {
        if (activeTabId) void nexus.nav.print(activeTabId)
      }
    },
    {
      id: 'copy',
      label: 'Copy link',
      icon: <Copy className="h-3.5 w-3.5" />,
      disabled: !activeTab?.url || isInternal,
      onSelect: () => {
        if (activeTab?.url) void navigator.clipboard.writeText(activeTab.url)
      }
    },
    {
      id: 'zoom-in',
      label: 'Zoom in',
      icon: <ZoomIn className="h-3.5 w-3.5" />,
      separatorBefore: true,
      onSelect: () => {
        if (activeTabId) void nexus.nav.zoomIn(activeTabId)
      }
    },
    {
      id: 'zoom-out',
      label: 'Zoom out',
      icon: <ZoomOut className="h-3.5 w-3.5" />,
      onSelect: () => {
        if (activeTabId) void nexus.nav.zoomOut(activeTabId)
      }
    },
    {
      id: 'zoom-reset',
      label: 'Reset zoom',
      disabled: !activeTab,
      onSelect: () => {
        if (activeTabId) void nexus.nav.resetZoom(activeTabId)
      }
    }
  ]

  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line bg-bg-elevated px-2">
      <IconButton label="Back" size="sm" disabled={!canGoBack} onClick={() => void goBack()}>
        <ArrowLeft className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Forward"
        size="sm"
        disabled={!canGoForward}
        onClick={() => void goForward()}
      >
        <ArrowRight className="h-4 w-4" />
      </IconButton>
      <IconButton
        label={isLoading ? 'Stop loading' : 'Reload'}
        size="sm"
        onClick={() => {
          if (isLoading) {
            if (activeTabId) void nexus.nav.stop(activeTabId)
          } else {
            void reload()
          }
        }}
      >
        {isLoading ? <Square className="h-3.5 w-3.5" /> : <RotateCw className="h-4 w-4" />}
      </IconButton>

      <div className="mx-1 h-4 w-px bg-line" aria-hidden="true" />

      <AddressBar />

      <div className="mx-1 h-4 w-px bg-line" aria-hidden="true" />

      <IconButton
        label={bookmarked ? 'Bookmarked' : 'Bookmark this page'}
        size="sm"
        disabled={!activeTab?.url || isInternal}
        onClick={() => void bookmarkCurrent()}
      >
        {bookmarked ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <BookMarked className="h-4 w-4" />
        )}
      </IconButton>
      <IconButton label="Find in page" size="sm" disabled={isInternal} onClick={() => toggleFind()}>
        <ScanText className="h-4 w-4" />
      </IconButton>
      <IconButton label="AI assistant" size="sm" active={aiOpen} onClick={() => toggleAi()}>
        <Sparkles className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Toggle the sidebar"
        size="sm"
        active={panel !== null}
        onClick={() => togglePanel('bookmarks')}
      >
        <PanelLeft className="h-4 w-4" />
      </IconButton>

      <span className="w-12 text-center text-[11px] tabular-nums text-ink-subtle">
        {Math.round((activeTab?.zoomFactor ?? 1) * 100)}%
      </span>

      <IconButton
        label="More actions"
        size="sm"
        onClick={(event) => setMenu({ x: event.clientX, y: event.clientY })}
      >
        <Ellipsis className="h-4 w-4" />
      </IconButton>

      {menu ? <Menu items={menuItems} x={menu.x} y={menu.y} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
