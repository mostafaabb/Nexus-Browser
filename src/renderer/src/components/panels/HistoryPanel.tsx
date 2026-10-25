import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Search, Trash } from 'lucide-react'
import type { HistoryEntry, HistoryRange } from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { Button, IconButton } from '../ui/Button'
import { Input, Select } from '../ui/Input'
import { EmptyState } from '../ui/Feedback'
import { formatRelativeTime } from '../../lib/format'

const RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: 'all', label: 'All time' },
  { id: 'hour', label: 'Last hour' },
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' }
]

export function HistoryPanel(): React.JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const navigate = useAppStore((state) => state.navigate)
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<HistoryRange>('all')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setEntries(await nexus.history.query({ search: query.trim(), range, limit: 500 }))
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [pushToast, query, range])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 150)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const grouped = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>()
    for (const entry of entries) {
      const key = new Date(entry.visitedAt).toDateString()
      const list = groups.get(key) ?? []
      list.push(entry)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [entries])

  const clearAll = async (): Promise<void> => {
    try {
      await nexus.history.clear('all')
      await refresh()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={query}
            placeholder="Search history"
            className="h-7 pl-7 text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          value={range}
          className="h-7 w-[112px] text-[12px]"
          onChange={(event) => setRange(event.target.value as HistoryRange)}
        >
          {RANGES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
        <IconButton label="Clear the whole history" size="sm" onClick={() => void clearAll()}>
          <Trash className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="nx-scroll min-h-0 flex-1 p-1.5">
        {entries.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-7 w-7" />}
            title={loading ? 'Loading history…' : 'No history yet'}
            description="Pages you visit are recorded locally. Private windows are never recorded."
          />
        ) : (
          grouped.map(([day, list]) => (
            <section key={day} className="mb-2">
              <h3 className="px-1.5 pt-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                {day}
              </h3>
              {list.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void navigate(entry.url)}
                    title={entry.url}
                  >
                    <span className="block truncate text-[12.5px] text-ink">
                      {entry.title || entry.url}
                    </span>
                    <span className="block truncate text-[11px] text-ink-subtle">{entry.url}</span>
                  </button>
                  <span className="shrink-0 text-[10.5px] text-ink-subtle">
                    {formatRelativeTime(entry.visitedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove this entry"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-danger group-hover:opacity-100"
                    onClick={() => {
                      void nexus.history
                        .remove([entry.id])
                        .then(refresh)
                        .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                    }}
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {entries.length > 0 ? (
        <div className="border-t border-line px-2 py-1.5">
          <Button size="sm" variant="ghost" className="w-full" onClick={() => void clearAll()}>
            Clear browsing history
          </Button>
        </div>
      ) : null}
    </div>
  )
}
