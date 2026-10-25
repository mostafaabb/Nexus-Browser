import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Clock, Globe, Search, Sparkles } from 'lucide-react'
import type { Bookmark as BookmarkRecord, HistoryEntry } from '@shared/types'
import { resolveDestination } from '@shared/navigation/url'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { useAiStore } from '../../store/ai-store'
import { formatRelativeTime } from '../../lib/format'

/** The new tab page: search, quick links and recent history. */
export function StartPage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const navigate = useAppStore((state) => state.navigate)
  const createTab = useAppStore((state) => state.createTab)
  const toggleAi = useAppStore((state) => state.toggleAi)
  const pushToast = useAppStore((state) => state.pushToast)
  const addPageContext = useAiStore((state) => state.addPageContext)

  const [query, setQuery] = useState('')
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const load = useCallback(async (): Promise<void> => {
    try {
      const [nextBookmarks, nextHistory] = await Promise.all([
        nexus.bookmarks.list(),
        nexus.history.query({ limit: 8 })
      ])
      setBookmarks(nextBookmarks.filter((item) => item.url).slice(0, 8))
      setHistory(nextHistory.slice(0, 8))
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast])

  useEffect(() => {
    void load()
  }, [load])

  const submit = (): void => {
    const trimmed = query.trim()
    if (!trimmed) return
    const destination = resolveDestination(trimmed, {
      searchEngineId: settings?.searchEngineId,
      customSearchTemplate: settings?.customSearchTemplate
    })
    if ('error' in destination) {
      pushToast(destination.error, 'error')
      return
    }
    void navigate(destination.url)
  }

  const quickLinks = useMemo(() => bookmarks.slice(0, 6), [bookmarks])

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto bg-bg px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            className="mb-4 grid h-12 w-12 place-items-center rounded-2xl text-xl font-bold text-accent-contrast"
            style={{ background: 'var(--nx-accent)' }}
            aria-hidden="true"
          >
            N
          </span>
          <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-ink">Nexus Browser</h1>
          <p className="text-[12.5px] text-ink-subtle">
            A local-first browser with a built-in assistant.
          </p>
        </div>

        <form
          className="mb-8 flex items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2.5 transition-colors focus-within:border-accent"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-ink-subtle" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search the web or enter an address"
            aria-label="Search the web or enter an address"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-subtle focus:outline-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>

        {quickLinks.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Bookmarks
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {quickLinks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                  onClick={() => bookmark.url && void navigate(bookmark.url)}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-subtle">
                    <Bookmark className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {bookmark.title}
                    </span>
                    <span className="block truncate text-[11px] text-ink-subtle">
                      {bookmark.url}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Recent history
            </h2>
            {history.length === 0 ? (
              <p className="text-[12px] text-ink-subtle">
                Pages you visit are listed here. Nothing leaves this machine.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                      onClick={() => void navigate(entry.url)}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">
                          {entry.title || entry.url}
                        </span>
                        <span className="block truncate text-[11px] text-ink-subtle">
                          {entry.url}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10.5px] text-ink-subtle">
                        {formatRelativeTime(entry.visitedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              What you can do
            </h2>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                  onClick={() => {
                    toggleAi()
                    void addPageContext(
                      useAppStore
                        .getState()
                        .tabs.filter((tab) => tab.id === useAppStore.getState().activeTabId)
                        .map((tab) => tab.id)
                    )
                  }}
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    <span className="block text-[12.5px] font-medium text-ink">
                      Ask the assistant about a page
                    </span>
                    <span className="block text-[11px] text-ink-subtle">
                      The assistant reads the page you select — nothing else.
                    </span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                  onClick={() => void createTab('nexus://dev')}
                >
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                  <span>
                    <span className="block text-[12.5px] font-medium text-ink">
                      Open the developer toolkit
                    </span>
                    <span className="block text-[11px] text-ink-subtle">
                      Reusable snippets and a local HTTP client.
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
