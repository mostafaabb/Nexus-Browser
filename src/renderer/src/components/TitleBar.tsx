import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Ghost, Plus, Split, SquareSplitHorizontal } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { Button, IconButton } from './ui/Button'
import { nexus } from '../lib/api'

/**
 * The topmost chrome row.
 *
 * It is also the window drag region, so it reserves the space on the right
 * that the operating system's caption buttons occupy.
 */
export function TitleBar(): React.JSX.Element {
  const workspaces = useAppStore((state) => state.workspaces)
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const activateWorkspace = useAppStore((state) => state.activateWorkspace)
  const createTab = useAppStore((state) => state.createTab)
  const toggleSplit = useAppStore((state) => state.toggleSplit)
  const splitEnabled = useAppStore((state) => state.split.enabled)
  const info = useAppStore((state) => state.info)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <header className="nx-drag relative flex h-10 shrink-0 items-center gap-2 border-b border-line bg-bg-elevated pr-[150px] pl-3">
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 place-items-center rounded-md text-[13px] font-bold text-accent-contrast"
          style={{ background: 'var(--nx-accent)' }}
          aria-hidden="true"
        >
          N
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-ink">Nexus</span>
      </div>

      <div className="mx-1 h-4 w-px bg-line" aria-hidden="true" />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="nx-no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: active?.color ?? 'var(--nx-accent)' }}
            aria-hidden="true"
          />
          <span className="max-w-[140px] truncate">{active?.name ?? 'Workspace'}</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="nx-no-drag absolute top-9 left-0 z-50 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/40"
          >
            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Workspaces
            </p>
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2"
                onClick={() => {
                  setMenuOpen(false)
                  void activateWorkspace(workspace.id)
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: workspace.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{workspace.name}</span>
                {workspace.id === activeWorkspaceId ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : null}
              </button>
            ))}
            <div className="mt-1 border-t border-line p-1">
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setMenuOpen(false)
                  void createTab('nexus://workspaces')
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Manage workspaces
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      <div className="nx-no-drag flex items-center gap-1">
        <IconButton
          label="Split view"
          size="sm"
          active={splitEnabled}
          onClick={() => void toggleSplit()}
        >
          <Split className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Open a private window"
          size="sm"
          onClick={() => {
            void nexus.app.createPrivateWindow()
          }}
        >
          <Ghost className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Open the developer toolkit"
          size="sm"
          onClick={() => {
            void createTab('nexus://dev')
          }}
        >
          <SquareSplitHorizontal className="h-4 w-4" />
        </IconButton>
      </div>

      {info?.isPrivate ? (
        <span className="nx-no-drag absolute right-[152px] bottom-1 flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
          <Ghost className="h-3 w-3" />
          Private
        </span>
      ) : null}
    </header>
  )
}
