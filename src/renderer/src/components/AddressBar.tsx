import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Clock, Lock, Search, ShieldAlert, TriangleAlert } from 'lucide-react'
import { resolveNavigationInput } from '@shared/navigation/url'
import { useAppStore } from '../store/app-store'
import { nexus } from '../lib/api'
import { cn } from '../lib/cn'
import { formatRelativeTime } from '../lib/format'

interface Suggestion {
  id: string
  title: string
  url: string
  source: 'history' | 'bookmark'
  visitedAt?: number
}

export function AddressBar(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const navigate = useAppStore((state) => state.navigate)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null

  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [highlighted, setHighlighted] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  const currentUrl = activeTab?.url || activeTab?.pendingUrl || ''

  useEffect(() => {
    if (!focused) setValue(currentUrl)
  }, [currentUrl, focused])

  // Ctrl+L (handled globally) focuses and selects the address bar.
  useEffect(() => {
    const focus = (): void => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('nexus:focus-address-bar', focus)
    return () => window.removeEventListener('nexus:focus-address-bar', focus)
  }, [])

  const loadSuggestions = useCallback(async (query: string): Promise<void> => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSuggestions([])
      return
    }
    const id = requestId.current + 1
    requestId.current = id
    try {
      const [history, bookmarks] = await Promise.all([
        nexus.history.query({ search: trimmed, limit: 6 }),
        nexus.bookmarks.search(trimmed)
      ])
      if (requestId.current !== id) return
      const merged: Suggestion[] = [
        ...history.map((entry) => ({
          id: `h-${entry.id}`,
          title: entry.title || entry.url,
          url: entry.url,
          source: 'history' as const,
          visitedAt: entry.visitedAt
        })),
        ...bookmarks
          .filter((bookmark) => bookmark.url)
          .map((bookmark) => ({
            id: `b-${bookmark.id}`,
            title: bookmark.title,
            url: bookmark.url!,
            source: 'bookmark' as const
          }))
      ]
      const seen = new Set<string>()
      setSuggestions(
        merged
          .filter((item) => {
            if (seen.has(item.url)) return false
            seen.add(item.url)
            return true
          })
          .slice(0, 8)
      )
      setHighlighted(-1)
    } catch {
      setSuggestions([])
    }
  }, [])

  useEffect(() => {
    if (!focused) return
    const timer = window.setTimeout(() => void loadSuggestions(value), 140)
    return () => window.clearTimeout(timer)
  }, [value, focused, loadSuggestions])

  const intent = useMemo(() => resolveNavigationInput(value), [value])
  const isInternal = currentUrl.startsWith('nexus://')
  const isSecure = currentUrl.startsWith('https://')
  const hasError = activeTab?.status === 'error'

  const submit = (target?: string): void => {
    const text = (target ?? value).trim()
    setFocused(false)
    setSuggestions([])
    if (!text) return
    void navigate(text)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlighted >= 0 && suggestions[highlighted]) {
        submit(suggestions[highlighted].url)
        return
      }
      submit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (suggestions.length > 0) {
        setSuggestions([])
        setHighlighted(-1)
        return
      }
      setValue(currentUrl)
      setFocused(false)
      inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((index) => {
        const next = index + delta
        if (next < 0) return suggestions.length - 1
        if (next >= suggestions.length) return 0
        return next
      })
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border bg-surface-2 px-3 transition-colors duration-100',
          focused ? 'border-accent' : 'border-line hover:border-line-strong'
        )}
      >
        {hasError ? (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />
        ) : isInternal ? (
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        ) : isSecure ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : currentUrl ? (
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        )}

        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          autoComplete="off"
          placeholder="Search or enter an address"
          aria-label="Address and search bar"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none"
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => {
            setFocused(true)
            event.currentTarget.select()
          }}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 120)
          }}
          onKeyDown={onKeyDown}
        />

        {value && intent.kind === 'search' ? (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-ink-subtle">
            Search
          </span>
        ) : null}
      </div>

      {focused && suggestions.length > 0 ? (
        <div className="absolute top-9 right-0 left-0 z-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl shadow-black/50">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                index === highlighted ? 'bg-surface-2' : 'hover:bg-surface-2'
              )}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                submit(suggestion.url)
              }}
            >
              {suggestion.source === 'bookmark' ? (
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-accent" />
              ) : (
                <Clock className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{suggestion.title}</span>
                <span className="block truncate text-[11px] text-ink-subtle">{suggestion.url}</span>
              </span>
              {suggestion.visitedAt ? (
                <span className="shrink-0 text-[10.5px] text-ink-subtle">
                  {formatRelativeTime(suggestion.visitedAt)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
