import { BrowserWindow, WebContentsView, net, session } from 'electron'
import { ALLOWED_SCHEMES, isDangerousUrl } from '@shared/navigation/url'
import { DEFAULT_PARTITION } from '@shared/constants/app'
import type { ViewLayoutEntry } from '@shared/types'
import { createLogger } from '../utils/logger'

const logger = createLogger('views')

/** Maximum size of an inlined favicon (bytes). */
const MAX_FAVICON_BYTES = 128 * 1024

export type ViewEvent =
  | {
      type: 'loading'
      tabId: string
      url: string
      isMainFrame: boolean
    }
  | {
      type: 'navigated'
      tabId: string
      url: string
      title: string
      isMainFrame: boolean
    }
  | { type: 'title'; tabId: string; title: string }
  | { type: 'favicon'; tabId: string; faviconUrl: string | null }
  | { type: 'stopped'; tabId: string; url: string }
  | { type: 'failed'; tabId: string; url: string; errorCode: number; description: string }
  | { type: 'crashed'; tabId: string; reason: string }
  | { type: 'media'; tabId: string; audible: boolean }
  | { type: 'open-url'; tabId: string; url: string; disposition: string }
  | { type: 'download-document'; tabId: string; url: string }
  | { type: 'zoom'; tabId: string; factor: number }

export interface BrowserViewManagerOptions {
  /** Called for every event produced by a managed view. */
  onEvent: (event: ViewEvent) => void
  /** Resolves the Electron session used for a tab. */
  resolvePartition: (tabId: string) => string
  /**
   * Reports whether a failed navigation was deliberately turned into a
   * download. Such an abort is expected and must not be shown as an error.
   */
  isExpectedNavigationFailure?: (url: string) => boolean
}

/**
 * Creates, tracks and lays out the `WebContentsView` instances that render
 * websites. Every view is fully isolated from the privileged application
 * renderer: no Node.js integration, context isolation and sandboxing enabled.
 */
export class BrowserViewManager {
  private readonly views = new Map<string, WebContentsView>()
  private readonly attached = new Set<string>()
  private readonly options: BrowserViewManagerOptions
  /** The window the views are attached to, so they can be detached again. */
  private hostWindow: BrowserWindow | null = null
  /** `${tabId}|${url}` -> time a download replaced the navigation. */
  private readonly reportedDownloads = new Map<string, number>()

  constructor(options: BrowserViewManagerOptions) {
    this.options = options
  }

  get partitionForDefault(): string {
    return DEFAULT_PARTITION
  }

  has(tabId: string): boolean {
    return this.views.has(tabId)
  }

  get(tabId: string): WebContentsView | undefined {
    return this.views.get(tabId)
  }

  getWebContents(tabId: string): Electron.WebContents | undefined {
    return this.views.get(tabId)?.webContents
  }

  create(tabId: string): WebContentsView {
    const existing = this.views.get(tabId)
    if (existing && !existing.webContents.isDestroyed()) return existing

    const partition = this.options.resolvePartition(tabId)
    const view = new WebContentsView({
      webPreferences: {
        preload: undefined,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        webviewTag: false,
        plugins: false,
        enableWebSQL: false,
        spellcheck: true,
        backgroundThrottling: false,
        // Electron resolves an explicit partition through `session.fromPartition()`.
        // For the name "default" that yields a throw-away *in-memory* session
        // instead of the persistent default session, which would make the
        // browser forget every cookie, every login and the whole cache on
        // every restart — and would hide the session from the download and
        // permission managers, which observe the real default session.
        // The option is therefore omitted for the default partition.
        ...(partition === DEFAULT_PARTITION ? {} : { partition })
      }
    })

    this.attachListeners(tabId, view)
    this.views.set(tabId, view)
    logger.debug('view created', { tabId, partition })
    return view
  }

  private attachListeners(tabId: string, view: WebContentsView): void {
    const contents = view.webContents

    contents.on('did-start-loading', () => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'loading', tabId, url: contents.getURL(), isMainFrame: true })
    })

    contents.on('did-stop-loading', () => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'stopped', tabId, url: contents.getURL() })
    })

    contents.on('did-navigate', (_event, url) => {
      if (contents.isDestroyed()) return
      this.options.onEvent({
        type: 'navigated',
        tabId,
        url,
        title: contents.getTitle(),
        isMainFrame: true
      })
    })

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (contents.isDestroyed()) return
      this.options.onEvent({
        type: 'navigated',
        tabId,
        url,
        title: contents.getTitle(),
        isMainFrame
      })
    })

    contents.on('page-title-updated', (_event, title) => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'title', tabId, title })
    })

    contents.on('page-favicon-updated', (_event, favicons) => {
      if (contents.isDestroyed()) return
      const icon = favicons.find((entry) => typeof entry === 'string' && entry.startsWith('http'))
      if (!icon) {
        this.options.onEvent({ type: 'favicon', tabId, faviconUrl: null })
        return
      }
      void this.loadFavicon(tabId, icon)
    })

    const failHandler = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (contents.isDestroyed()) return
      if (!isMainFrame) return
      // ERR_ABORTED (-3) is emitted for cancelled navigations and is not an error.
      if (errorCode === -3) return
      // A navigation to a document that cannot be rendered (a PDF) is turned
      // into a download by the PDF navigation handler. Chromium reports that
      // cancellation as ERR_BLOCKED_BY_CLIENT; it is not a failure, but the
      // tab is still showing the empty document that was committed at the file
      // URL, so the application has to put the previous page back.
      if (this.options.isExpectedNavigationFailure?.(validatedURL)) {
        logger.debug('navigation replaced by a download', { tabId, url: validatedURL })
        const key = `${tabId}|${validatedURL}`
        const reportedAt = this.reportedDownloads.get(key)
        // Both the provisional and the final load report the same cancellation.
        if (reportedAt === undefined || Date.now() - reportedAt > 2_000) {
          this.reportedDownloads.set(key, Date.now())
          this.options.onEvent({ type: 'download-document', tabId, url: validatedURL })
        }
        return
      }
      this.options.onEvent({
        type: 'failed',
        tabId,
        url: validatedURL,
        errorCode,
        description: errorDescription
      })
    }
    contents.on('did-fail-load', failHandler)
    contents.on('did-fail-provisional-load', failHandler)

    contents.on('render-process-gone', (_event, details) => {
      this.options.onEvent({ type: 'crashed', tabId, reason: details.reason })
    })

    contents.on('audio-state-changed', (event) => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'media', tabId, audible: event.audible })
    })

    contents.on('media-started-playing', () => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'media', tabId, audible: true })
    })

    contents.on('media-paused', () => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'media', tabId, audible: false })
    })

    // Electron only reports the zoom *direction*; the authoritative factor is
    // read back from the view.
    contents.on('zoom-changed', () => {
      if (contents.isDestroyed()) return
      this.options.onEvent({ type: 'zoom', tabId, factor: contents.getZoomFactor() })
    })

    // New windows are never created implicitly. The URL is handed back to the
    // application which decides whether to open it in a tab or externally.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      this.options.onEvent({ type: 'open-url', tabId, url, disposition })
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (!this.isNavigable(url)) {
        event.preventDefault()
        logger.warn('blocked navigation', { tabId, url })
      }
    })

    contents.on('will-redirect', (event, url) => {
      if (!this.isNavigable(url)) {
        event.preventDefault()
        logger.warn('blocked redirect', { tabId, url })
      }
    })

    contents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
      // Certificate errors are never bypassed.
      event.preventDefault()
      callback(false)
    })
  }

  /**
   * Downloads a favicon in the main process and hands it to the renderer as a
   * `data:` URL.
   *
   * The renderer never loads a third party URL itself, which keeps the
   * content security policy of the application shell strict and avoids
   * leaking the browsing activity of the user to icon hosts.
   */
  private async loadFavicon(tabId: string, url: string): Promise<void> {
    if (!this.isNavigable(url)) {
      this.options.onEvent({ type: 'favicon', tabId, faviconUrl: null })
      return
    }
    try {
      const response = await net.fetch(url, { method: 'GET' })
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0] ?? ''
      if (!response.ok || !contentType.startsWith('image/')) {
        this.options.onEvent({ type: 'favicon', tabId, faviconUrl: null })
        return
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_FAVICON_BYTES) {
        this.options.onEvent({ type: 'favicon', tabId, faviconUrl: null })
        return
      }
      const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`
      this.options.onEvent({ type: 'favicon', tabId, faviconUrl: dataUrl })
    } catch (error) {
      logger.debug('favicon could not be loaded', {
        tabId,
        message: error instanceof Error ? error.message : 'unknown error'
      })
      this.options.onEvent({ type: 'favicon', tabId, faviconUrl: null })
    }
  }

  /** Only http(s) destinations may be loaded by a website view. */
  isNavigable(url: string): boolean {
    if (isDangerousUrl(url)) return false
    try {
      return ALLOWED_SCHEMES.has(new URL(url).protocol)
    } catch {
      return false
    }
  }

  async load(tabId: string, url: string): Promise<void> {
    if (!this.isNavigable(url)) {
      logger.warn('refused to load unsafe url', { tabId, url })
      return
    }
    // A tab that is currently showing an internal page has no website view
    // yet, because internal pages are rendered by the application shell. The
    // view is created here so that such a navigation is never dropped.
    let view = this.views.get(tabId)
    if (!view || view.webContents.isDestroyed()) {
      view = this.create(tabId)
    }
    try {
      await view.webContents.loadURL(url)
    } catch (error) {
      // Navigation failures are reported through did-fail-load; this catch
      // prevents unhandled rejections for aborted loads.
      logger.debug('load rejected', { tabId, message: error instanceof Error ? error.message : '' })
    }
  }

  /** Applies the layout reported by the renderer. */
  applyLayout(window: BrowserWindow | null, entries: ViewLayoutEntry[]): void {
    if (!window || window.isDestroyed()) return
    this.hostWindow = window
    const wanted = new Set(entries.map((entry) => entry.tabId))

    for (const tabId of [...this.attached]) {
      if (!wanted.has(tabId)) {
        const view = this.views.get(tabId)
        if (view && !view.webContents.isDestroyed()) {
          window.contentView.removeChildView(view)
        }
        this.attached.delete(tabId)
      }
    }

    for (const entry of entries) {
      let view = this.views.get(entry.tabId)
      if (!view || view.webContents.isDestroyed()) {
        view = this.create(entry.tabId)
      }
      view.setBounds({
        x: Math.round(entry.x),
        y: Math.round(entry.y),
        width: Math.max(0, Math.round(entry.width)),
        height: Math.max(0, Math.round(entry.height))
      })
      if (!this.attached.has(entry.tabId)) {
        window.contentView.addChildView(view)
        this.attached.add(entry.tabId)
      }
    }
  }

  destroy(tabId: string): void {
    const view = this.views.get(tabId)
    if (!view) return
    // Detach the view before it is destroyed, otherwise the window would keep
    // a child view that points at a dead web contents.
    if (this.attached.has(tabId)) {
      const host = this.hostWindow
      if (host && !host.isDestroyed()) {
        try {
          host.contentView.removeChildView(view)
        } catch (error) {
          logger.debug('view detach failed', {
            tabId,
            message: error instanceof Error ? error.message : ''
          })
        }
      }
      this.attached.delete(tabId)
    }
    this.views.delete(tabId)
    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close()
      }
    } catch (error) {
      logger.debug('view close failed', {
        tabId,
        message: error instanceof Error ? error.message : ''
      })
    }
  }

  destroyAll(): void {
    for (const tabId of [...this.views.keys()]) this.destroy(tabId)
  }

  /** Clears the browsing data of the given Electron sessions. */
  static async clearBrowsingData(
    partitions: string[],
    options: { cookies?: boolean; cache?: boolean; storage?: boolean }
  ): Promise<void> {
    const sessions = partitions.map((partition) =>
      partition === DEFAULT_PARTITION ? session.defaultSession : session.fromPartition(partition)
    )
    for (const target of sessions) {
      if (!target) continue
      if (options.cookies) {
        await target.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage']
        })
      }
      if (options.cache) {
        await target.clearCache()
      }
      if (options.storage) {
        await target.clearStorageData({ storages: ['filesystem', 'shadercache', 'serviceworkers'] })
      }
    }
  }
}
