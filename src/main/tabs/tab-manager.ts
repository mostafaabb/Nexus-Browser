import type { TabGroup, TabState, WorkspaceId } from '@shared/types'
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, internalPageTitle } from '@shared/constants/app'
import { getOriginHost, isInternalUrl, isWebUrl } from '@shared/navigation/url'
import type { BrowserViewManager, ViewEvent } from '../browser/browser-view-manager'
import type { WorkspacesRepository } from '../database/repositories/workspaces-repository'
import type { SessionsRepository } from '../database/repositories/sessions-repository'
import { createId } from '../utils/id'
import { createLogger } from '../utils/logger'

const logger = createLogger('tabs')

/** Only real web pages are recorded in the browsing history. */
function isRecordableUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export interface TabManagerOptions {
  workspaceId: string
  isPrivate: boolean
  views: BrowserViewManager
  workspaces: WorkspacesRepository
  sessions: SessionsRepository
  onChange: () => void
}

/**
 * Owns the authoritative tab state for a single browsing context (one window).
 */
export class TabManager {
  private readonly tabs = new Map<string, TabState>()
  private readonly order = new Map<WorkspaceId, string[]>()
  private readonly persistedSnapshots = new Map<string, string>()
  private readonly options: TabManagerOptions
  private activeTabId: string | null = null

  constructor(options: TabManagerOptions) {
    this.options = options
    if (!this.order.has(options.workspaceId)) this.order.set(options.workspaceId, [])
  }

  get isPrivate(): boolean {
    return this.options.isPrivate
  }

  get activeTab(): TabState | null {
    return this.activeTabId ? (this.tabs.get(this.activeTabId) ?? null) : null
  }

  get activeTabIdValue(): string | null {
    return this.activeTabId
  }

  getTab(tabId: string): TabState | null {
    return this.tabs.get(tabId) ?? null
  }

  listTabs(workspaceId?: WorkspaceId): TabState[] {
    const target = workspaceId ?? this.options.workspaceId
    const ids = this.order.get(target) ?? []
    return ids.map((id) => this.tabs.get(id)).filter((tab): tab is TabState => Boolean(tab))
  }

  listAll(): TabState[] {
    // The order the user arranged the tabs in must survive a round trip to
    // the renderer, otherwise a drag-and-drop would be undone immediately.
    const ordered: TabState[] = []
    const seen = new Set<string>()
    for (const ids of this.order.values()) {
      for (const id of ids) {
        const tab = this.tabs.get(id)
        if (!tab || seen.has(id)) continue
        seen.add(id)
        ordered.push(tab)
      }
    }
    // Tabs that are not part of an order list yet are appended at the end.
    for (const tab of this.tabs.values()) {
      if (seen.has(tab.id)) continue
      seen.add(tab.id)
      ordered.push(tab)
    }
    return ordered
  }

  private idsFor(workspaceId: WorkspaceId): string[] {
    let ids = this.order.get(workspaceId)
    if (!ids) {
      ids = []
      this.order.set(workspaceId, ids)
    }
    return ids
  }

  createTab(input: {
    url?: string
    workspaceId?: WorkspaceId
    activate?: boolean
    pinned?: boolean
    title?: string
  }): TabState {
    const workspaceId = input.workspaceId ?? this.options.workspaceId
    const id = createId('tab')
    const now = Date.now()
    const tab: TabState = {
      id,
      workspaceId,
      groupId: null,
      title: input.title ?? 'New Tab',
      url: '',
      faviconUrl: null,
      status: 'idle',
      loading: false,
      progress: 0,
      canGoBack: false,
      canGoForward: false,
      zoomFactor: 1,
      pinned: input.pinned ?? false,
      muted: false,
      audible: false,
      crashed: false,
      isActive: false,
      error: null,
      errorCode: null,
      openerTabId: null,
      createdAt: now,
      lastActiveAt: now,
      pendingUrl: null,
      private: this.options.isPrivate
    }

    this.tabs.set(id, tab)
    const ids = this.idsFor(workspaceId)
    const insertAt = tab.pinned ? 0 : ids.length
    ids.splice(insertAt, 0, id)
    if (!this.options.isPrivate) {
      this.options.workspaces.addTab({
        workspaceId,
        tabId: id,
        position: insertAt,
        groupId: null,
        pinned: tab.pinned,
        url: input.url ?? '',
        title: tab.title
      })
    }

    const target = input.url ?? ''
    if (target && !isWebUrl(target)) {
      // Internal pages are rendered by the application shell — no website view
      // is created for them.
      tab.url = target
      tab.title = isInternalUrl(target) ? internalPageTitle(target) : tab.title
      tab.pendingUrl = null
    } else {
      this.options.views.create(id)
      if (target) {
        tab.pendingUrl = target
        void this.options.views.load(id, target)
      }
    }

    if (input.activate !== false) this.activateTab(id)
    this.options.onChange()
    logger.debug('tab created', { tabId: id, workspaceId })
    return tab
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    if (!tab) return false

    if (!this.options.isPrivate) {
      this.options.sessions.addRecentlyClosed({
        url: tab.url || tab.pendingUrl || '',
        title: tab.title,
        workspaceId: tab.workspaceId,
        groupId: tab.groupId
      })
    }

    this.tabs.delete(tabId)
    this.persistedSnapshots.delete(tabId)
    for (const ids of this.order.values()) {
      const index = ids.indexOf(tabId)
      if (index >= 0) ids.splice(index, 1)
    }
    if (!this.options.isPrivate) this.options.workspaces.removeTab(tabId)
    this.options.views.destroy(tabId)

    if (this.activeTabId === tabId) {
      const remaining = this.listTabs(tab.workspaceId)
      this.activeTabId = remaining.length > 0 ? (remaining[0]?.id ?? null) : null
      const next = this.activeTabId ? this.tabs.get(this.activeTabId) : null
      if (next) next.isActive = true
    }
    this.options.onChange()
    return true
  }

  /**
   * Closes every tab that belongs to a workspace.
   *
   * The tab rows reference the workspace they live in, so the tabs have to go
   * before the workspace itself can be deleted.
   */
  closeWorkspace(workspaceId: WorkspaceId): string[] {
    const ids = [...(this.order.get(workspaceId) ?? [])]
    const closed: string[] = []
    for (const id of ids) {
      if (this.closeTab(id)) closed.push(id)
    }
    this.order.delete(workspaceId)
    return closed
  }

  activateTab(tabId: string): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    if (this.activeTabId && this.activeTabId !== tabId) {
      const previous = this.tabs.get(this.activeTabId)
      if (previous) previous.isActive = false
    }
    this.activeTabId = tabId
    tab.isActive = true
    tab.lastActiveAt = Date.now()
    this.options.onChange()
    return tab
  }

  /**
   * Switches the workspace this context is currently showing. Tabs of the
   * previous workspace stay open and are re-attached when the user switches
   * back.
   */
  setWorkspace(workspaceId: WorkspaceId): void {
    this.options.workspaceId = workspaceId
    if (!this.order.has(workspaceId)) this.order.set(workspaceId, [])
    this.options.onChange()
  }

  reorder(workspaceId: WorkspaceId, orderedIds: string[]): TabState[] {
    const ids = this.idsFor(workspaceId)
    const known = new Set(ids)
    const next: string[] = []
    for (const id of orderedIds) {
      if (known.has(id) && !next.includes(id)) next.push(id)
    }
    for (const id of ids) {
      if (!next.includes(id)) next.push(id)
    }
    this.order.set(workspaceId, next)
    if (!this.options.isPrivate) {
      next.forEach((id, index) => this.options.workspaces.updateTab(id, { position: index }))
    }
    this.options.onChange()
    return this.listTabs(workspaceId)
  }

  moveToWorkspace(tabId: string, workspaceId: WorkspaceId): TabState[] {
    const tab = this.tabs.get(tabId)
    if (!tab) return this.listTabs()
    const previous = this.idsFor(tab.workspaceId)
    const index = previous.indexOf(tabId)
    if (index >= 0) previous.splice(index, 1)
    tab.workspaceId = workspaceId
    const target = this.idsFor(workspaceId)
    target.push(tabId)
    if (!this.options.isPrivate) this.options.workspaces.moveTab(tabId, workspaceId)
    this.options.onChange()
    return this.listTabs(workspaceId)
  }

  setPinned(tabId: string, pinned: boolean): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    tab.pinned = pinned
    if (!this.options.isPrivate) this.options.workspaces.updateTab(tabId, { pinned })
    const ids = this.idsFor(tab.workspaceId)
    const index = ids.indexOf(tabId)
    if (index >= 0) ids.splice(index, 1)
    const pinnedCount = ids.filter((id) => this.tabs.get(id)?.pinned).length
    ids.splice(pinnedCount, 0, tabId)
    this.reorder(tab.workspaceId, ids)
    this.options.onChange()
    return tab
  }

  setMuted(tabId: string, muted: boolean): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    const contents = this.options.views.getWebContents(tabId)
    if (contents && !contents.isDestroyed()) {
      contents.setAudioMuted(muted)
    }
    tab.muted = muted
    this.options.onChange()
    return tab
  }

  duplicateTab(tabId: string): TabState | null {
    const source = this.tabs.get(tabId)
    if (!source) return null
    return this.createTab({
      url: source.url || source.pendingUrl || undefined,
      workspaceId: source.workspaceId,
      title: source.title
    })
  }

  setZoom(tabId: string, factor: number): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    const clamped = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor))
    const contents = this.options.views.getWebContents(tabId)
    if (contents && !contents.isDestroyed()) {
      contents.setZoomFactor(clamped)
    }
    tab.zoomFactor = clamped
    this.options.onChange()
    return tab
  }

  /** Applies an event produced by the underlying web contents. */
  applyViewEvent(event: ViewEvent): void {
    const tab = this.tabs.get(event.tabId)
    if (!tab) return

    switch (event.type) {
      case 'loading': {
        tab.loading = true
        tab.status = 'loading'
        tab.error = null
        tab.errorCode = null
        tab.crashed = false
        break
      }
      case 'navigated': {
        if (!event.isMainFrame) break
        tab.url = event.url
        tab.title = event.title || tab.title
        tab.loading = false
        tab.status = 'idle'
        tab.error = null
        tab.errorCode = null
        tab.pendingUrl = null
        tab.crashed = false
        this.updateHistoryState(tab)
        this.persistSnapshot(tab)
        this.recordHistory(tab.id, event.url, event.title)
        break
      }
      case 'stopped': {
        tab.loading = false
        if (tab.status === 'loading') tab.status = 'idle'
        break
      }
      case 'title': {
        tab.title = event.title
        this.persistSnapshot(tab)
        this.onUpdateHistoryTitle?.(tab.url, event.title)
        break
      }
      case 'favicon': {
        tab.faviconUrl = event.faviconUrl
        break
      }
      case 'failed': {
        tab.loading = false
        tab.status = 'error'
        tab.error = event.description || 'The page could not be loaded.'
        tab.errorCode = String(event.errorCode)
        break
      }
      case 'crashed': {
        tab.loading = false
        tab.status = 'crashed'
        tab.crashed = true
        tab.error = `The page stopped responding (${event.reason}).`
        break
      }
      case 'media': {
        tab.audible = event.audible
        break
      }
      case 'zoom': {
        tab.zoomFactor = event.factor
        break
      }
      case 'open-url': {
        break
      }
    }

    this.updateHistoryState(tab)
    this.options.onChange()
  }

  private updateHistoryState(tab: TabState): void {
    const contents = this.options.views.getWebContents(tab.id)
    if (!contents || contents.isDestroyed()) return
    const history = contents.navigationHistory
    tab.canGoBack = history.canGoBack()
    tab.canGoForward = history.canGoForward()
  }

  /**
   * Writes the URL/title of a tab to the workspace store so that the session
   * can be restored after a restart. Writes are skipped when nothing changed
   * to avoid hammering the database on every navigation event.
   */
  private persistSnapshot(tab: TabState): void {
    if (this.options.isPrivate) return
    const url = tab.url || tab.pendingUrl || ''
    const title = tab.title || ''
    const fingerprint = `${url}\u0000${title}`
    if (this.persistedSnapshots.get(tab.id) === fingerprint) return
    this.persistedSnapshots.set(tab.id, fingerprint)
    this.options.workspaces.updateTab(tab.id, { url, title })
  }

  /**
   * Handles a navigation that was replaced by a download.
   *
   * Chromium still commits an empty document at the file URL, so the page the
   * user came from has to be put back. A tab that was opened only for the file
   * has no previous page and would stay blank forever, so it is closed the way
   * Chrome closes it.
   */
  documentDownloadStarted(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if (!tab.url) {
      this.closeTab(tabId)
      return
    }

    const previousUrl = tab.url
    tab.pendingUrl = null
    tab.loading = false
    tab.status = 'idle'
    tab.error = null
    tab.errorCode = null

    const contents = this.options.views.getWebContents(tabId)
    if (contents && !contents.isDestroyed() && contents.getURL() !== previousUrl) {
      // Reloading the page is deliberate: going back in the navigation history
      // restores the page from the back/forward cache, but the restored view no
      // longer receives mouse or keyboard input after the cancelled PDF
      // navigation (verified with real input events). A fresh load always does.
      void this.options.views.load(tabId, previousUrl)
    }
    this.options.onChange()
  }

  /**
   * Navigates a tab. Internal `nexus://` destinations are handled by the
   * application shell and are never loaded into a website view.
   */
  navigate(tabId: string, url: string): TabState | null {
    const tab = this.tabs.get(tabId)
    if (!tab) return null
    if (url.startsWith('nexus://')) {
      tab.url = url
      tab.title = internalPageTitle(url)
      tab.loading = false
      tab.status = 'idle'
      tab.error = null
      tab.errorCode = null
      tab.canGoBack = false
      tab.canGoForward = false
      tab.faviconUrl = null
      tab.pendingUrl = null
      this.options.onChange()
      return tab
    }

    // A tab that currently shows an internal page is rendered by React and has
    // no website pane. The tab state is switched to the website immediately so
    // that the shell replaces the internal page with the native view instead
    // of keeping the old page on screen while the new one loads invisibly.
    const current = tab.url || tab.pendingUrl || 'nexus://start'
    if (isInternalUrl(current)) {
      tab.url = ''
      tab.pendingUrl = url
      tab.title = getOriginHost(url) ?? url
      tab.faviconUrl = null
      tab.canGoBack = false
      tab.canGoForward = false
      tab.loading = true
      tab.status = 'loading'
      tab.error = null
      tab.errorCode = null
      this.options.onChange()
    }

    void this.options.views.load(tabId, url)
    return tab
  }

  /** Records the navigation in the history store (unless disabled/private). */
  recordHistory(tabId: string, url: string, title: string): void {
    if (this.options.isPrivate) return
    if (!isRecordableUrl(url)) return
    const tab = this.tabs.get(tabId)
    if (!tab) return
    this.onRecordHistory?.(url, title)
  }

  onRecordHistory: ((url: string, title: string) => void) | null = null
  onUpdateHistoryTitle: ((url: string, title: string) => void) | null = null

  /** Restores persisted tabs (used at startup). */
  restoreTabs(
    tabs: Array<{ tabId: string; url: string; title: string; groupId: string | null }>
  ): void {
    for (const item of tabs) {
      if (!item.url || !isWebUrl(item.url)) continue
      const id = item.tabId
      const now = Date.now()
      const tab: TabState = {
        id,
        workspaceId: this.options.workspaceId,
        groupId: item.groupId,
        title: item.title || 'New Tab',
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
        createdAt: now,
        lastActiveAt: now,
        pendingUrl: item.url,
        private: this.options.isPrivate
      }
      this.tabs.set(id, tab)
      this.persistedSnapshots.set(id, `${item.url}\u0000${item.title || ''}`)
      this.idsFor(this.options.workspaceId).push(id)
      this.options.views.create(id)
      void this.options.views.load(id, item.url)
    }
    this.options.onChange()
  }

  /** Creates the tab groups of a workspace inside this context. */
  listGroups(): TabGroup[] {
    return this.options.workspaces.listGroups(this.options.workspaceId)
  }

  destroyAll(): void {
    for (const tabId of [...this.tabs.keys()]) {
      this.options.views.destroy(tabId)
    }
    this.tabs.clear()
    this.order.clear()
    this.persistedSnapshots.clear()
    this.activeTabId = null
  }
}
