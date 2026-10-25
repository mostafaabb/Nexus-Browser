/**
 * Application bootstrap.
 *
 * Owns the Electron application lifecycle: the single instance lock, the
 * creation of the dependency container, the registration of the IPC surface
 * and the creation (and restoration) of the first browser window.
 */

import { app, BrowserWindow } from 'electron'
import type { Workspace } from '@shared/types'
import { registerIpc } from '../ipc/register-ipc'
import { AppServices } from './services'
import { createLogger } from '../utils/logger'

const logger = createLogger('bootstrap')

let services: AppServices | null = null
let isQuitting = false

/** Returns the shared service container (throws when the app is not ready). */
export function getServices(): AppServices {
  if (!services) {
    throw new Error(
      'Application services are not available yet. The app has not finished starting.'
    )
  }
  return services
}

/**
 * Ensures a workspace exists and returns the workspace that should be used
 * when the application starts.
 */
function resolveStartupWorkspace(): Workspace {
  const settings = services!.settings.getAll()
  const workspaces = services!.workspaces.list()

  if (workspaces.length === 0) {
    const created = services!.workspaces.create({
      name: 'Personal',
      icon: 'globe',
      color: '#8b5cf6',
      layout: 'single'
    })
    services!.workspaces.setDefault(created.id)
    services!.settings.set('defaultWorkspaceId', created.id)
    logger.info('seeded default workspace', { workspaceId: created.id })
    return created
  }

  const defaultWorkspace = workspaces.find((workspace) => workspace.isDefault)
  const preferred =
    (settings.defaultWorkspaceId
      ? workspaces.find((workspace) => workspace.id === settings.defaultWorkspaceId)
      : undefined) ??
    defaultWorkspace ??
    workspaces[0]!

  return preferred
}

/** Creates the first window and restores the previous session when configured. */
function createInitialWindow(): void {
  const workspace = resolveStartupWorkspace()
  const context = services!.windows.createMainWindow(workspace.id)
  const settings = services!.settings.getAll()

  const behaviour = settings.startupBehavior
  if (behaviour === 'new-tab') {
    context.tabs.createTab({ url: settings.homePage, workspaceId: workspace.id })
    return
  }

  if (behaviour === 'restore-session') {
    const stored = services!.workspaces.listTabs(workspace.id)
    const restorable = stored.filter((record) => record.url && /^https?:\/\//i.test(record.url))
    if (restorable.length > 0) {
      context.tabs.restoreTabs(
        restorable.map((record) => ({
          tabId: record.tabId,
          url: record.url,
          title: record.title,
          groupId: record.groupId
        }))
      )
      const first = context.tabs.listTabs(workspace.id)[0]
      if (first) context.tabs.activateTab(first.id)
      logger.info('restored session', { tabs: restorable.length })
      return
    }
  }

  if (behaviour === 'continue-where-left') {
    // Re-open the most recently visited pages from the history store.
    const entries = services!.history.query({ limit: 5 })
    const seen = new Set<string>()
    const candidates = entries.filter((entry) => {
      if (seen.has(entry.url)) return false
      seen.add(entry.url)
      return /^https?:\/\//i.test(entry.url)
    })
    if (candidates.length > 0) {
      for (const entry of candidates) {
        context.tabs.createTab({
          url: entry.url,
          title: entry.title,
          workspaceId: workspace.id,
          activate: false
        })
      }
      const first = context.tabs.listTabs(workspace.id)[0]
      if (first) context.tabs.activateTab(first.id)
      logger.info('continued where left off', { tabs: candidates.length })
      return
    }
  }

  context.tabs.createTab({ url: settings.homePage, workspaceId: workspace.id })
}

/** Wires the Electron lifecycle events. */
export function bootstrap(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (!existing) return
    if (existing.isMinimized()) existing.restore()
    existing.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    // Defence in depth: no renderer may open a native window. The specific
    // handlers installed later (application shell, website views) override
    // this one where a different behaviour is required.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })

  app.whenReady().then(
    () => {
      try {
        services = new AppServices()
        registerIpc(services)
        services.downloadManager.attach()
        services.pdfNavigation.attach()
        services.permissionManager.attach()

        app.on('activate', () => {
          if (BrowserWindow.getAllWindows().length === 0) createInitialWindow()
        })

        createInitialWindow()
        logger.info('nexus browser started')
      } catch (error) {
        logger.error('failed to start the application', {
          message: error instanceof Error ? error.message : String(error)
        })
        app.quit()
      }
    },
    (error: unknown) => {
      logger.error('electron failed to become ready', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  )

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    if (isQuitting) return
    isQuitting = true
    try {
      if (services) {
        if (services.settings.getAll().clearHistoryOnExit) {
          services.history.clear()
        }
        services.dispose()
      }
    } catch (error) {
      logger.error('failed to dispose services cleanly', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { message: error.message, stack: error.stack ?? '' })
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', {
      message: reason instanceof Error ? reason.message : String(reason)
    })
  })
}
