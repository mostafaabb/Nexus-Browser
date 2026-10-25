import { app, session } from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '@shared/types'
import { DatabaseService } from '../database'
import type {
  AiRepository,
  BookmarksRepository,
  CollectionsRepository,
  HistoryRepository,
  HttpHistoryRepository,
  PermissionsRepository,
  SessionsRepository,
  SettingsRepository,
  SnippetsRepository,
  WorkspacesRepository
} from '../database'
import { CredentialStore } from '../security/credential-store'
import { WindowManager, type BrowserContext } from '../windows/window-manager'
import { DownloadManager } from '../downloads/download-manager'
import { PermissionManager, type PendingRequest } from '../permissions/permission-manager'
import { AiService } from '../ai/ai-service'
import { ContextExtractor } from '../ai/context-extractor'
import { HttpClient } from '../developer-tools/http-client'
import { BrowserViewManager } from '../browser/browser-view-manager'
import { PdfNavigationHandler } from '../browser/pdf-navigation-handler'
import { CookiePolicy } from '../privacy/cookie-policy'
import { DEFAULT_PARTITION, PRIVATE_PARTITION } from '@shared/constants/app'
import { createLogger } from '../utils/logger'

const logger = createLogger('services')

/** Name of the workspace that backs private windows. */
const PRIVATE_WORKSPACE_NAME = 'Private'

/**
 * Central dependency container for the main process.
 */
export class AppServices {
  readonly database: DatabaseService
  readonly credentials: CredentialStore
  readonly windows: WindowManager
  readonly downloadManager: DownloadManager
  readonly permissionManager: PermissionManager
  readonly ai: AiService
  readonly http: HttpClient
  readonly cookiePolicy: CookiePolicy
  readonly pdfNavigation: PdfNavigationHandler

  get settings(): SettingsRepository {
    return this.database.repositories.settings
  }

  get bookmarks(): BookmarksRepository {
    return this.database.repositories.bookmarks
  }

  get history(): HistoryRepository {
    return this.database.repositories.history
  }

  get workspaces(): WorkspacesRepository {
    return this.database.repositories.workspaces
  }

  get sessions(): SessionsRepository {
    return this.database.repositories.sessions
  }

  get snippets(): SnippetsRepository {
    return this.database.repositories.snippets
  }

  get collections(): CollectionsRepository {
    return this.database.repositories.collections
  }

  get permissions(): PermissionsRepository {
    return this.database.repositories.permissions
  }

  get httpHistory(): HttpHistoryRepository {
    return this.database.repositories.httpHistory
  }

  get aiRepository(): AiRepository {
    return this.database.repositories.ai
  }

  constructor() {
    const userData = app.getPath('userData')
    this.database = new DatabaseService(join(userData, 'nexus.db'))
    this.credentials = new CredentialStore(this.database.db)

    this.windows = new WindowManager({
      database: this.database,
      onContextChange: (context) => {
        this.windows.send(context, 'tab:list-changed', context.tabs.listAll())
      },
      onOpenUrl: (context, url) => {
        // Links opened by a website are opened as regular tabs when they are
        // safe http(s) destinations, otherwise they are ignored.
        if (!/^https?:\/\//i.test(url)) {
          logger.warn('ignored window.open for unsupported url')
          return
        }
        context.tabs.createTab({ url, workspaceId: context.workspaceId })
      },
      onWindowClosed: (context) => {
        if (context.isPrivate) {
          this.permissionManager.denyAll()
        }
      }
    })

    this.http = new HttpClient({ defaultTimeoutMs: 30_000 })

    // The policy is installed on the very sessions the website views use, so
    // that the toggle in the settings really affects the browsing.
    const websiteSessions = [
      session.defaultSession,
      session.fromPartition(PRIVATE_PARTITION)
    ].filter((target): target is Electron.Session => Boolean(target))

    this.cookiePolicy = new CookiePolicy({ sessions: websiteSessions })
    this.cookiePolicy.attach()
    this.cookiePolicy.setBlocking(this.settings.getAll().blockThirdPartyCookies)

    // Electron's PDF viewer does not render, so a top-level navigation to a
    // PDF is turned into a regular download instead of leaving a blank tab.
    this.pdfNavigation = new PdfNavigationHandler({ sessions: websiteSessions })
    this.windows.setExpectedNavigationFailure((url) =>
      this.pdfNavigation.isExpectedNavigationFailure(url)
    )

    this.ai = new AiService({
      database: this.database,
      credentials: this.credentials
    })

    this.downloadManager = new DownloadManager({
      downloads: this.database.repositories.downloads,
      settings: this.settings,
      partitions: [DEFAULT_PARTITION, PRIVATE_PARTITION],
      onUpdated: (record) => {
        this.windows.broadcast('download:updated', record)
      },
      onRemoved: () => {
        this.windows.broadcast('download:removed', { id: '*' })
      }
    })

    this.permissionManager = new PermissionManager({
      permissions: this.database.repositories.permissions,
      requestDecision: (request) => {
        this.broadcastPermissionRequest(request)
      }
    })
  }

  private broadcastPermissionRequest(request: PendingRequest): void {
    for (const context of this.windows.all) {
      this.windows.send(context, 'permission:requested', {
        requestId: request.id,
        origin: request.origin,
        permission: request.permission,
        mediaTypes: request.mediaTypes
      })
      break
    }
  }

  /**
   * Returns the id of the workspace that private windows use.
   *
   * The workspace is created once and then reused, so that private windows
   * always start from the same place.
   */
  ensurePrivateWorkspace(): string {
    const existing = this.workspaces
      .list()
      .find((workspace) => workspace.name === PRIVATE_WORKSPACE_NAME)
    if (existing) return existing.id
    const created = this.workspaces.create({
      name: PRIVATE_WORKSPACE_NAME,
      icon: 'ghost',
      color: '#64748b'
    })
    logger.info('created the private workspace', { workspaceId: created.id })
    return created.id
  }

  broadcastWorkspaces(): void {
    this.windows.broadcast('workspace:changed', this.workspaces.list())
  }

  tabContents(context: BrowserContext, tabId: unknown): Electron.WebContents | undefined {
    if (typeof tabId !== 'string') return undefined
    const contents = context.views.getWebContents(tabId)
    if (!contents || contents.isDestroyed()) return undefined
    return contents
  }

  contextExtractor(context: BrowserContext): ContextExtractor {
    return new ContextExtractor(context.views)
  }

  applySettings(settings: AppSettings): void {
    this.windows.broadcast('workspace:changed', this.workspaces.list())
    this.cookiePolicy.setBlocking(settings.blockThirdPartyCookies)
  }

  async clearCache(): Promise<void> {
    await BrowserViewManager.clearBrowsingData([DEFAULT_PARTITION, PRIVATE_PARTITION], {
      cache: true
    })
  }

  async clearCookies(): Promise<void> {
    await BrowserViewManager.clearBrowsingData([DEFAULT_PARTITION, PRIVATE_PARTITION], {
      cookies: true,
      storage: true
    })
  }

  dispose(): void {
    this.http.cancelAll()
    this.ai.stopAll()
    this.permissionManager.denyAll()
    this.windows.destroyAll()
    this.database.close()
  }
}
