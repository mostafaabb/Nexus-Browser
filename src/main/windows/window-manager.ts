import { BrowserWindow, app, session } from 'electron'
import { join } from 'node:path'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  DEFAULT_PARTITION,
  PRIVATE_PARTITION,
  PRIVATE_SHELL_PARTITION,
  SHELL_PARTITION
} from '@shared/constants/app'
import { BrowserViewManager } from '../browser/browser-view-manager'
import { TabManager } from '../tabs/tab-manager'
import type { DatabaseService } from '../database'
import { createLogger } from '../utils/logger'

const logger = createLogger('windows')

/**
 * Content security policy of the privileged application shell.
 *
 * The shell can talk to the main process, so it is locked down to its own
 * resources. Websites are rendered in separate views with their own (far
 * more permissive) policies and are never affected by this one.
 */
const SHELL_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "worker-src 'self'"
].join('; ')

/** Development needs inline scripts and a websocket for hot module replacement. */
const SHELL_CSP_DEV = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** Guards against installing the header listener twice on the same session. */
const cspSessions = new Set<string>()

export interface BrowserContext {
  id: number
  window: BrowserWindow
  views: BrowserViewManager
  tabs: TabManager
  isPrivate: boolean
  workspaceId: string
}

export interface WindowManagerOptions {
  database: DatabaseService
  /** Called whenever the tab list of any context changed. */
  onContextChange: (context: BrowserContext) => void
  /** Called when a website asks to open a URL. */
  onOpenUrl: (context: BrowserContext, url: string, disposition: string) => void
  /** Called when the user closes a window. */
  onWindowClosed: (context: BrowserContext) => void
}

/**
 * Creates and tracks the application windows. Each window owns an isolated
 * browsing context (tabs + web contents views) so private windows can use a
 * separate Electron session partition.
 */
export class WindowManager {
  private readonly contexts = new Map<number, BrowserContext>()
  private readonly options: WindowManagerOptions
  private nextContextId = 1
  /** Set by the application once the PDF navigation handler exists. */
  private expectedNavigationFailure: (url: string) => boolean = () => false

  constructor(options: WindowManagerOptions) {
    this.options = options
  }

  get all(): BrowserContext[] {
    return [...this.contexts.values()]
  }

  get mainContext(): BrowserContext | undefined {
    return this.contexts.values().next().value
  }

  getContext(windowId: number): BrowserContext | undefined {
    return this.contexts.get(windowId)
  }

  getContextByWebContents(webContentsId: number): BrowserContext | undefined {
    for (const context of this.contexts.values()) {
      if (!context.window.isDestroyed() && context.window.webContents.id === webContentsId) {
        return context
      }
    }
    return undefined
  }

  /** Tells the window manager how deliberate download aborts are recognised. */
  setExpectedNavigationFailure(check: (url: string) => boolean): void {
    this.expectedNavigationFailure = check
  }

  /** Creates the main application window. */
  createMainWindow(workspaceId: string): BrowserContext {
    return this.createWindow({ workspaceId, isPrivate: false, show: true })
  }

  /** Creates a private browsing window using an isolated session. */
  createPrivateWindow(workspaceId: string): BrowserContext {
    return this.createWindow({ workspaceId, isPrivate: true, show: true })
  }

  private createWindow(options: {
    workspaceId: string
    isPrivate: boolean
    show: boolean
  }): BrowserContext {
    const id = this.nextContextId++
    const contextId = id

    const window = new BrowserWindow({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      backgroundColor: '#0b0d12',
      title: 'Nexus Browser',
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#98a2b3',
        height: 40
      },
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        webviewTag: false,
        plugins: false,
        spellcheck: true,
        partition: options.isPrivate ? PRIVATE_SHELL_PARTITION : SHELL_PARTITION
      }
    })

    const views = new BrowserViewManager({
      onEvent: (event) => {
        const context = this.contexts.get(contextId)
        if (!context) return
        if (event.type === 'open-url') {
          this.options.onOpenUrl(context, event.url, event.disposition)
          return
        }
        if (event.type === 'download-document') {
          // The file was downloaded instead of rendered; put the page back.
          context.tabs.documentDownloadStarted(event.tabId)
          this.options.onContextChange(context)
          return
        }
        context.tabs.applyViewEvent(event)
        this.options.onContextChange(context)
      },
      resolvePartition: () => (options.isPrivate ? PRIVATE_PARTITION : DEFAULT_PARTITION),
      isExpectedNavigationFailure: (url) => this.expectedNavigationFailure(url)
    })

    const tabs = new TabManager({
      workspaceId: options.workspaceId,
      isPrivate: options.isPrivate,
      views,
      workspaces: this.options.database.repositories.workspaces,
      sessions: this.options.database.repositories.sessions,
      onChange: () => {
        const context = this.contexts.get(contextId)
        if (context) this.options.onContextChange(context)
      }
    })

    tabs.onRecordHistory = (url, title) => {
      const settings = this.options.database.repositories.settings.getAll()
      if (!settings.recordHistory) return
      this.options.database.repositories.history.record(url, title)
    }

    tabs.onUpdateHistoryTitle = (url, title) => {
      if (!url) return
      const settings = this.options.database.repositories.settings.getAll()
      if (!settings.recordHistory) return
      this.options.database.repositories.history.updateTitle(url, title)
    }

    const context: BrowserContext = {
      id: contextId,
      window,
      views,
      tabs,
      isPrivate: options.isPrivate,
      workspaceId: options.workspaceId
    }
    this.contexts.set(contextId, context)

    window.once('ready-to-show', () => {
      if (options.show) window.show()
    })

    window.on('closed', () => {
      this.contexts.delete(contextId)
      tabs.destroyAll()
      this.options.onWindowClosed(context)
    })

    window.on('maximize', () => {
      window.webContents.send('window:state', { maximized: true, focused: true })
    })
    window.on('unmaximize', () => {
      window.webContents.send('window:state', { maximized: false, focused: true })
    })
    window.on('focus', () => {
      window.webContents.send('window:state', {
        maximized: window.isMaximized(),
        focused: true
      })
    })

    // The application shell never navigates away from the bundled renderer.
    window.webContents.on('will-navigate', (event) => {
      event.preventDefault()
    })
    // The shell does not open native windows. External links are opened
    // through the explicit `app:openExternal` IPC channel, which validates
    // the scheme before handing the URL to the operating system.
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const query = options.isPrivate ? '?private=1' : ''

    this.applyShellCsp(options.isPrivate ? PRIVATE_SHELL_PARTITION : SHELL_PARTITION)

    if (rendererUrl) {
      void window.loadURL(`${rendererUrl}${query}`)
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
    }

    logger.info('window created', { contextId, private: options.isPrivate })
    return context
  }

  /** Sends the content security policy header for the application shell. */
  private applyShellCsp(partition: string): void {
    if (cspSessions.has(partition)) return
    const target = session.fromPartition(partition)
    if (!target) return
    cspSessions.add(partition)
    const policy = app.isPackaged ? SHELL_CSP : SHELL_CSP_DEV
    target.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [policy]
        }
      })
    })
  }

  /**
   * Removes a workspace from every browsing context.
   *
   * The tabs of a workspace reference it, so they have to be closed before the
   * workspace row can be deleted. Every context that was showing the removed
   * workspace is switched to the fallback workspace.
   */
  removeWorkspace(workspaceId: string, fallbackWorkspaceId: string): void {
    for (const context of this.contexts.values()) {
      context.tabs.closeWorkspace(workspaceId)
      if (context.workspaceId !== workspaceId) continue

      context.workspaceId = fallbackWorkspaceId
      context.tabs.setWorkspace(fallbackWorkspaceId)

      let first = context.tabs.listTabs(fallbackWorkspaceId)[0]
      if (!first) {
        first = context.tabs.createTab({ url: 'nexus://start', workspaceId: fallbackWorkspaceId })
      }
      context.tabs.activateTab(first.id)
    }
  }

  broadcast(channel: string, payload?: unknown): void {
    for (const context of this.contexts.values()) {
      if (context.window.isDestroyed()) continue
      context.window.webContents.send(channel, payload)
    }
  }

  send(context: BrowserContext, channel: string, payload?: unknown): void {
    if (context.window.isDestroyed()) return
    context.window.webContents.send(channel, payload)
  }

  destroyAll(): void {
    for (const context of [...this.contexts.values()]) {
      if (!context.window.isDestroyed()) context.window.destroy()
    }
    this.contexts.clear()
  }
}
