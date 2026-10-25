import { useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { Viewport } from './components/Viewport'
import { StatusBar } from './components/StatusBar'
import { Toaster } from './components/Toaster'
import { FindBar } from './components/FindBar'
import { PermissionPrompt } from './components/PermissionPrompt'
import { AiPanel } from './components/AiPanel'
import { useAppStore } from './store/app-store'
import { useAiStore } from './store/ai-store'
import { nexus } from './lib/api'

/** Applies the theme and accent colour to the document root. */
function useTheme(): void {
  const theme = useAppStore((state) => state.settings?.theme ?? 'dark')
  const accent = useAppStore((state) => state.settings?.accent ?? 'violet')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      document.documentElement.dataset.theme = resolved
      void nexus.window.setTheme(resolved).catch(() => undefined)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  useEffect(() => {
    const reduceMotion = useAppStore.getState().settings?.reduceMotion ?? false
    document.documentElement.dataset.reduceMotion = String(reduceMotion)
  }, [])
}

/** Global keyboard shortcuts that do not belong to a single component. */
function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useAppStore.getState()
      const meta = event.ctrlKey || event.metaKey

      if (meta && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('nexus:focus-address-bar'))
        return
      }
      if (meta && event.key.toLowerCase() === 't') {
        event.preventDefault()
        void store.createTab()
        return
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        void store.createTab()
        return
      }
      if (meta && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        if (store.activeTabId) void store.closeTab(store.activeTabId)
        return
      }
      if (meta && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        void store.createTab('nexus://downloads')
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        void store.createTab('nexus://bookmarks')
        return
      }
      if (meta && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        store.toggleAi()
        return
      }
      if (event.key === 'F5' || (meta && event.key.toLowerCase() === 'r')) {
        event.preventDefault()
        void store.reload(event.shiftKey)
        return
      }
      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        store.toggleFind()
        return
      }
      if (event.key === 'F6') {
        event.preventDefault()
        store.toggleAi()
        return
      }
      if (meta && event.key === 'Tab') {
        const tabs = store.tabs.filter((tab) => tab.workspaceId === store.activeWorkspaceId)
        if (tabs.length === 0) return
        event.preventDefault()
        const index = tabs.findIndex((tab) => tab.id === store.activeTabId)
        const next = (index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length
        void store.activateTab(tabs[next]!.id)
        return
      }
      if (meta && /^[1-9]$/.test(event.key)) {
        const tabs = store.tabs.filter((tab) => tab.workspaceId === store.activeWorkspaceId)
        const index = Number(event.key) - 1
        if (tabs[index]) {
          event.preventDefault()
          void store.activateTab(tabs[index]!.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

export default function App(): React.JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const fatalError = useAppStore((state) => state.fatalError)
  const aiOpen = useAppStore((state) => state.aiOpen)
  const initialize = useAppStore((state) => state.initialize)
  const initializeAi = useAiStore((state) => state.initialize)

  useTheme()
  useShortcuts()

  useEffect(() => {
    void initialize()
    void initializeAi()
  }, [initialize, initializeAi])

  if (fatalError) {
    return (
      <div className="flex h-full items-center justify-center bg-bg p-8">
        <div className="max-w-md rounded-lg border border-danger/40 bg-surface p-5">
          <h1 className="mb-2 text-[15px] font-semibold text-danger">Nexus could not start</h1>
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-muted">{fatalError}</p>
          <p className="text-[11.5px] text-ink-subtle">
            Check the application log in the folder shown below for more details.
          </p>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <span
            className="grid h-10 w-10 animate-pulse place-items-center rounded-xl text-lg font-bold text-accent-contrast"
            style={{ background: 'var(--nx-accent)' }}
            aria-hidden="true"
          >
            N
          </span>
          <p className="text-[12px] text-ink-subtle">Starting Nexus…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg text-ink">
      <TitleBar />
      <TabStrip />
      <Toolbar />
      <PermissionPrompt />
      <FindBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="flex min-w-0 flex-1">
          <Viewport />
          {aiOpen ? (
            <aside
              aria-label="AI assistant"
              className="nx-animate-in w-[420px] shrink-0 border-l border-line bg-surface"
            >
              <AiPanel />
            </aside>
          ) : null}
        </main>
      </div>

      <Toaster />
      <StatusBar />
    </div>
  )
}
