import { describe, expect, it } from 'vitest'
import type { SplitLayout, TabState } from '@shared/types'
import { computePanes, effectiveUrl } from '@renderer/lib/viewport'

function tab(overrides: Partial<TabState> & { id: string }): TabState {
  return {
    workspaceId: 'ws-1',
    groupId: null,
    title: '',
    url: '',
    faviconUrl: null,
    status: 'idle',
    loading: false,
    progress: 0,
    canGoBack: false,
    canGoForward: false,
    zoomFactor: 1,
    pinned: false,
    muted: false,
    audible: false,
    crashed: false,
    isActive: false,
    error: null,
    errorCode: null,
    openerTabId: null,
    createdAt: 0,
    lastActiveAt: 0,
    pendingUrl: null,
    private: false,
    ...overrides
  }
}

const noSplit: SplitLayout = {
  enabled: false,
  orientation: 'vertical',
  ratio: 0.5,
  leftTabId: null,
  rightTabId: null
}

describe('effectiveUrl', () => {
  it('falls back to the start page', () => {
    expect(effectiveUrl(undefined)).toBe('nexus://start')
  })

  it('prefers the committed url', () => {
    expect(effectiveUrl(tab({ id: 'a', url: 'https://example.com' }))).toBe('https://example.com')
  })

  it('uses the pending url when there is no committed url yet', () => {
    expect(effectiveUrl(tab({ id: 'a', url: '', pendingUrl: 'https://other.com' }))).toBe(
      'https://other.com'
    )
  })
})

describe('computePanes', () => {
  it('returns the active tab when the split is disabled', () => {
    const tabs = [tab({ id: 'a', url: 'https://a.com' }), tab({ id: 'b', url: 'https://b.com' })]
    const panes = computePanes(tabs, 'b', noSplit)
    expect(panes).toHaveLength(1)
    expect(panes[0]).toEqual({ tabId: 'b', kind: 'web', route: null })
  })

  it('returns nothing when there is no active tab', () => {
    expect(computePanes([], null, noSplit)).toEqual([])
  })

  it('marks internal pages as internal panes', () => {
    const tabs = [tab({ id: 'a', url: 'nexus://bookmarks' })]
    const panes = computePanes(tabs, 'a', noSplit)
    expect(panes[0]).toEqual({ tabId: 'a', kind: 'internal', route: 'nexus://bookmarks' })
  })

  it('returns both panes when the split is enabled', () => {
    const tabs = [tab({ id: 'a', url: 'https://a.com' }), tab({ id: 'b', url: 'https://b.com' })]
    const panes = computePanes(tabs, 'a', {
      ...noSplit,
      enabled: true,
      leftTabId: 'a',
      rightTabId: 'b'
    })
    expect(panes.map((pane) => pane.tabId)).toEqual(['a', 'b'])
  })

  it('skips a split side whose tab no longer exists', () => {
    const tabs = [tab({ id: 'a', url: 'https://a.com' })]
    const panes = computePanes(tabs, 'a', {
      ...noSplit,
      enabled: true,
      leftTabId: 'a',
      rightTabId: 'gone'
    })
    expect(panes.map((pane) => pane.tabId)).toEqual(['a'])
  })
})
