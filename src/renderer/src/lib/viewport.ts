/**
 * Pure helpers that describe which panes the content area shows.
 *
 * They live outside of the component so that the layout logic can be unit
 * tested without rendering the whole application shell.
 */

import type { SplitLayout, TabState } from '@shared/types'
import { isInternalUrl } from '@shared/navigation/url'

export interface ViewPane {
  tabId: string
  kind: 'web' | 'internal'
  route: string | null
}

/** The URL that describes what a tab currently shows. */
export function effectiveUrl(tab: TabState | undefined): string {
  if (!tab) return 'nexus://start'
  return tab.url || tab.pendingUrl || 'nexus://start'
}

/** Computes the panes that are visible for the current tab and split state. */
export function computePanes(
  tabs: TabState[],
  activeTabId: string | null,
  split: SplitLayout
): ViewPane[] {
  const toPane = (tab: TabState): ViewPane => {
    const url = effectiveUrl(tab)
    return isInternalUrl(url)
      ? { tabId: tab.id, kind: 'internal', route: url }
      : { tabId: tab.id, kind: 'web', route: null }
  }

  if (!split.enabled) {
    const active = tabs.find((tab) => tab.id === activeTabId)
    return active ? [toPane(active)] : []
  }

  const left = tabs.find((tab) => tab.id === split.leftTabId)
  const right = tabs.find((tab) => tab.id === split.rightTabId)
  const panes: ViewPane[] = []
  if (left) panes.push(toPane(left))
  if (right) panes.push(toPane(right))
  return panes
}
