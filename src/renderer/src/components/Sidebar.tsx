import { Bookmark, Clock, Code, Download, LayoutGrid, Plus, Settings, Terminal } from 'lucide-react'
import { useAppStore, type PanelId } from '../store/app-store'
import { IconButton } from './ui/Button'
import { BookmarksPanel } from './panels/BookmarksPanel'
import { HistoryPanel } from './panels/HistoryPanel'
import { DownloadsPanel } from './panels/DownloadsPanel'
import { SnippetsPanel } from './panels/SnippetsPanel'
import { cn } from '../lib/cn'

const PANEL_ICONS: Array<{ id: PanelId; label: string; icon: typeof Bookmark }> = [
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'snippets', label: 'Snippets', icon: Code }
]

/**
 * The left navigation rail plus the optional drawer that shows the selected
 * panel. The drawer lives *outside* of the content area so that it never
 * overlaps a website view.
 */
export function Sidebar(): React.JSX.Element {
  const panel = useAppStore((state) => state.panel)
  const togglePanel = useAppStore((state) => state.togglePanel)
  const createTab = useAppStore((state) => state.createTab)

  return (
    <aside className="flex shrink-0">
      <nav
        aria-label="Primary"
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-line bg-bg-elevated py-2"
      >
        {PANEL_ICONS.map((item) => {
          const Icon = item.icon
          return (
            <IconButton
              key={item.id}
              label={item.label}
              size="md"
              active={panel === item.id}
              className={cn('h-9 w-9')}
              onClick={() => togglePanel(item.id)}
            >
              <Icon className="h-[17px] w-[17px]" />
            </IconButton>
          )
        })}

        <div className="mt-auto flex flex-col items-center gap-1">
          <IconButton
            label="Workspaces"
            size="md"
            className="h-9 w-9"
            onClick={() => void createTab('nexus://workspaces')}
          >
            <LayoutGrid className="h-[17px] w-[17px]" />
          </IconButton>
          <IconButton
            label="Developer toolkit"
            size="md"
            className="h-9 w-9"
            onClick={() => void createTab('nexus://dev')}
          >
            <Terminal className="h-[17px] w-[17px]" />
          </IconButton>
          <IconButton
            label="Settings"
            size="md"
            className="h-9 w-9"
            onClick={() => void createTab('nexus://settings')}
          >
            <Settings className="h-[17px] w-[17px]" />
          </IconButton>
          <IconButton
            label="New tab"
            size="md"
            className="h-9 w-9"
            onClick={() => void createTab()}
          >
            <Plus className="h-[17px] w-[17px]" />
          </IconButton>
        </div>
      </nav>

      {panel ? (
        <section
          aria-label={`${panel} panel`}
          className="nx-animate-in w-[280px] shrink-0 border-r border-line bg-surface"
        >
          {panel === 'bookmarks' ? <BookmarksPanel /> : null}
          {panel === 'history' ? <HistoryPanel /> : null}
          {panel === 'downloads' ? <DownloadsPanel /> : null}
          {panel === 'snippets' ? <SnippetsPanel /> : null}
        </section>
      ) : null}
    </aside>
  )
}
