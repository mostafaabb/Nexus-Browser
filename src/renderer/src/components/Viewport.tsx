import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ViewLayoutEntry } from '@shared/types'
import { useAppStore } from '../store/app-store'
import { nexus } from '../lib/api'
import { cn } from '../lib/cn'
import { computePanes } from '../lib/viewport'
import { InternalPage } from './InternalPage'

/**
 * The content area of the browser.
 *
 * React renders the internal pages; websites are rendered by real Chromium
 * views that live *above* the renderer. The renderer therefore measures the
 * placeholder elements and reports their bounds to the main process, which
 * applies them to the native views.
 */
export function Viewport(): React.JSX.Element {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const split = useAppStore((state) => state.split)
  const setSplit = useAppStore((state) => state.setSplit)
  const containerRef = useRef<HTMLDivElement>(null)
  const slots = useRef(new Map<string, HTMLDivElement>())
  const frame = useRef(0)

  const panes = useMemo(() => computePanes(tabs, activeTabId, split), [tabs, activeTabId, split])

  const syncLayout = useCallback((): void => {
    const entries: ViewLayoutEntry[] = []
    for (const [tabId, element] of slots.current) {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      entries.push({
        tabId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      })
    }
    void nexus.layout.setViews(entries).catch(() => {
      /* The window may be closing — the layout update is then irrelevant. */
    })
  }, [])

  const schedule = useCallback((): void => {
    if (frame.current) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0
      syncLayout()
    })
  }, [syncLayout])

  useEffect(() => {
    schedule()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => schedule())
    observer.observe(container)
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame.current) {
        window.cancelAnimationFrame(frame.current)
        frame.current = 0
      }
    }
  }, [panes, schedule])

  // Drop the measurements of panes that no longer exist.
  useEffect(() => {
    const alive = new Set(panes.map((pane) => pane.tabId))
    for (const tabId of [...slots.current.keys()]) {
      if (!alive.has(tabId)) slots.current.delete(tabId)
    }
  }, [panes])

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (moveEvent: PointerEvent): void => {
      if (split.orientation === 'vertical') {
        const ratio = (moveEvent.clientX - rect.left) / rect.width
        setSplit({ ratio: Math.min(0.8, Math.max(0.2, ratio)) })
      } else {
        const ratio = (moveEvent.clientY - rect.top) / rect.height
        setSplit({ ratio: Math.min(0.8, Math.max(0.2, ratio)) })
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (panes.length === 0) {
    return (
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-bg">
        <div className="grid h-full place-items-center text-[13px] text-ink-subtle">
          No open tabs
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-bg">
      <div
        className={cn(
          'flex h-full w-full',
          split.enabled && split.orientation === 'vertical' ? 'flex-row' : 'flex-col'
        )}
      >
        {panes.map((pane, index) => {
          const isFirst = index === 0
          const flexStyle =
            split.enabled && panes.length > 1
              ? { flex: isFirst ? `0 0 ${split.ratio * 100}%` : '1 1 auto' }
              : { flex: '1 1 auto' }

          return (
            <div key={pane.tabId} className="relative min-w-0 min-h-0" style={flexStyle}>
              {pane.kind === 'internal' ? (
                <InternalPage route={pane.route ?? 'nexus://start'} />
              ) : (
                <div
                  ref={(element) => {
                    if (element) slots.current.set(pane.tabId, element)
                    else slots.current.delete(pane.tabId)
                  }}
                  className="h-full w-full"
                  data-tab-slot={pane.tabId}
                />
              )}

              {split.enabled && panes.length > 1 && index === 0 ? (
                <div
                  role="separator"
                  aria-orientation={split.orientation === 'vertical' ? 'vertical' : 'horizontal'}
                  className={cn(
                    'absolute z-10 bg-line-strong transition-colors hover:bg-accent',
                    split.orientation === 'vertical'
                      ? 'top-0 right-0 h-full w-[3px] cursor-col-resize'
                      : 'right-0 bottom-0 left-0 h-[3px] cursor-row-resize'
                  )}
                  onPointerDown={startResize}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
