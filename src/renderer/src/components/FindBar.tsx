import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { nexus, errorMessage } from '../lib/api'
import { useAppStore } from '../store/app-store'
import { IconButton } from './ui/Button'
import { Input } from './ui/Input'

/** The "find in page" bar, shown below the toolbar. */
export function FindBar(): React.JSX.Element | null {
  const findOpen = useAppStore((state) => state.findOpen)
  const toggleFind = useAppStore((state) => state.toggleFind)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const pushToast = useAppStore((state) => state.pushToast)

  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState(0)
  const [ordinal, setOrdinal] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (findOpen) inputRef.current?.focus()
  }, [findOpen])

  useEffect(() => {
    if (!findOpen) {
      setMatches(0)
      setOrdinal(0)
      setQuery('')
    }
  }, [findOpen])

  useEffect(() => {
    return () => {
      if (activeTabId) void nexus.nav.stopFindInPage(activeTabId).catch(() => undefined)
    }
  }, [activeTabId])

  // Closing the bar (Escape, the close button or the toolbar toggle) must also
  // clear the highlight in the page, otherwise the last match stays selected.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !findOpen && activeTabId) {
      void nexus.nav.stopFindInPage(activeTabId).catch(() => undefined)
    }
    wasOpen.current = findOpen
  }, [activeTabId, findOpen])

  if (!findOpen) return null

  const run = async (forward: boolean, findNext: boolean): Promise<void> => {
    if (!activeTabId || !query) return
    try {
      const result = await nexus.nav.findInPage(activeTabId, query, forward, findNext)
      setMatches(result.matches)
      setOrdinal(result.activeMatchOrdinal)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b border-line bg-bg-elevated px-2">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={query}
          placeholder="Find in page"
          aria-label="Find in page"
          className="h-7 w-64 text-[12px]"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void run(!event.shiftKey, false)
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              toggleFind()
            }
          }}
        />
        <span className="w-20 text-[11px] tabular-nums text-ink-subtle">
          {matches > 0 ? `${ordinal}/${matches}` : query ? 'No results' : ''}
        </span>
        <IconButton
          label="Previous match"
          size="sm"
          disabled={matches === 0}
          onClick={() => void run(false, true)}
        >
          <ChevronUp className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Next match"
          size="sm"
          disabled={matches === 0}
          onClick={() => void run(true, true)}
        >
          <ChevronDown className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Close the find bar"
          size="sm"
          onClick={() => {
            if (activeTabId) void nexus.nav.stopFindInPage(activeTabId).catch(() => undefined)
            toggleFind()
          }}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}
