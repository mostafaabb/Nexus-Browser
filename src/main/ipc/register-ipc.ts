import { app, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/contracts/channels'
import type { IpcRequests } from '@shared/contracts/ipc'
import { ERROR_CODES, AppError, toSerializedError } from '@shared/errors'
import {
  parsePayload,
  zAiConversationIdRequest,
  zAiConversationTitleRequest,
  zAiExtractContextRequest,
  zAiProviderConfigRequest,
  zAiRenameConversationRequest,
  zAiSendRequest,
  zApiRequestPayload,
  zApiRequestRecordRequest,
  zBookmarkExportRequest,
  zBookmarkFolderRequest,
  zBookmarkMoveRequest,
  zBookmarkReorderRequest,
  zBookmarkRequest,
  zBookmarkSearchRequest,
  zBookmarkUpdateRequest,
  zClearBrowsingDataRequest,
  zCollectionCreateRequest,
  zCollectionUpdateRequest,
  zCreateTabRequest,
  zDownloadClearRequest,
  zFindInPageRequest,
  zGroupCreateRequest,
  zGroupIdRequest,
  zGroupUpdateRequest,
  zHistoryClearRequest,
  zHistoryQueryRequest,
  zHistoryRemoveRequest,
  zIdSchema,
  zImportRequest,
  zNameRequest,
  zNavigateRequest,
  zOpenExternalRequest,
  zOpenInNewTabRequest,
  zOpenTextFileRequest,
  zPathRequest,
  zPermissionRespondRequest,
  zPermissionSetRequest,
  zRenameSessionRequest,
  zRequestCancelRequest,
  zRequestListRequest,
  zSaveSessionRequest,
  zSaveTextFileRequest,
  zSettingsPatchRequest,
  zSnippetListRequest,
  zSnippetSaveRequest,
  zTabGroupAssignRequest,
  zTabIdSchema,
  zTabIdsRequest,
  zTabIndexRequest,
  zTabMutedRequest,
  zTabPinnedRequest,
  zTabReloadRequest,
  zTabWorkspaceRequest,
  zViewLayoutRequest,
  zWindowThemeRequest,
  zWindowTitleRequest,
  zWorkspaceCreateRequest,
  zWorkspaceIdRequest,
  zWorkspaceIdsRequest,
  zWorkspaceUpdateRequest,
  zZoomRequest
} from '@shared/schemas'
import { isDangerousUrl, isInternalUrl, resolveDestination } from '@shared/navigation/url'
import { APP_NAME } from '@shared/constants/app'
import type { AppServices } from '../app/services'
import type { BrowserContext } from '../windows/window-manager'
import {
  exportBookmarksHtml,
  exportBookmarksJson,
  exportCollections,
  importBookmarks,
  importCollections
} from '../developer-tools/import-export'
import { createLogger } from '../utils/logger'

const logger = createLogger('ipc')

/** HTTP methods that may be stored in a request collection. */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const

/** Body encodings that may be stored in a request collection. */
const BODY_TYPES = ['none', 'json', 'text', 'form'] as const

/**
 * Requests picture-in-picture for the page's own media element.
 *
 * Electron only exposes the feature through the HTML media API, so the call is
 * forwarded to the page instead of pretending the browser can start it.
 */
const PICTURE_IN_PICTURE_SCRIPT = `(async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return { ok: true, active: false, reason: null };
    }
    const videos = Array.from(document.querySelectorAll('video'));
    const video = videos.find((item) => !item.paused) || videos[0];
    if (!video) return { ok: false, active: false, reason: 'This page has no video element.' };
    if (!video.requestPictureInPicture) {
      return { ok: false, active: false, reason: 'This video does not support picture-in-picture.' };
    }
    await video.requestPictureInPicture();
    return { ok: true, active: true, reason: null };
  } catch (error) {
    return {
      ok: false,
      active: false,
      reason: 'Picture-in-picture was refused: ' + (error && error.message ? error.message : String(error))
    };
  }
})()`

type Handler<K extends keyof IpcRequests> = (
  payload: IpcRequests[K]['request'],
  context: BrowserContext
) => IpcRequests[K]['response'] | Promise<IpcRequests[K]['response']>

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

/**
 * Registers every privileged IPC handler.
 *
 * Each handler:
 *  - verifies that the sender belongs to a known application window,
 *  - validates the payload with a Zod schema,
 *  - performs a narrow, operation specific task,
 *  - returns a serialisable result.
 */
export function registerIpc(services: AppServices): void {
  const handle = <K extends keyof IpcRequests>(channel: K, handler: Handler<K>): void => {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<Envelope<unknown>> => {
      const context = services.windows.getContextByWebContents(event.sender.id)
      if (!context) {
        logger.warn('rejected ipc call from unknown sender', { channel })
        return {
          ok: false,
          error: {
            code: ERROR_CODES.UNAUTHORIZED_SENDER,
            message: 'The request was rejected because it did not come from a Nexus Browser window.'
          }
        }
      }
      try {
        const data = await handler(payload as IpcRequests[K]['request'], context)
        return { ok: true, data }
      } catch (error) {
        const serialized = toSerializedError(error)
        if (serialized.code === ERROR_CODES.UNKNOWN) {
          logger.error(`ipc handler failed: ${channel}`, {
            message: serialized.message
          })
        }
        return { ok: false, error: serialized }
      }
    })
  }

  /**
   * Resolves the web contents that belong to a tab.
   *
   * Internal `nexus://` pages are rendered by the application shell and have
   * no web contents of their own. `null` is returned for them so that callers
   * can decide whether the operation is simply not applicable instead of
   * reporting a missing tab.
   */
  const contentsOfTab = (context: BrowserContext, tabId: string): Electron.WebContents | null => {
    if (!context.tabs.getTab(tabId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    }
    return services.tabContents(context, tabId) ?? null
  }

  /* ------------------------------------------------------------- app --- */

  handle(IPC_CHANNELS.appGetInfo, (_payload, context) => ({
    name: APP_NAME,
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    nodeVersion: process.versions.node,
    platform: process.platform,
    isPackaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
    workspaceId: context.workspaceId,
    isPrivate: context.isPrivate
  }))

  handle(IPC_CHANNELS.appOpenExternal, (payload) => {
    const { url } = parsePayload(zOpenExternalRequest, payload)
    // `mailto:` is not navigable but is safe to hand to the operating system,
    // so it is screened separately from the http(s) navigation allow-list.
    if (isDangerousUrl(url, ['mailto:'])) {
      throw new AppError(ERROR_CODES.BLOCKED_SCHEME, 'That link uses a protocol Nexus cannot open.')
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'That link is not a valid URL.')
    }
    const allowed = ['http:', 'https:', 'mailto:']
    if (!allowed.includes(parsed.protocol)) {
      throw new AppError(
        ERROR_CODES.BLOCKED_SCHEME,
        `Nexus does not open "${parsed.protocol}" links automatically.`
      )
    }
    void shell.openExternal(parsed.toString())
    return { opened: true }
  })

  handle(IPC_CHANNELS.appRevealPath, (payload) => {
    const { path } = parsePayload(zPathRequest, payload)
    if (!existsSync(path)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That file no longer exists.')
    }
    shell.showItemInFolder(path)
    return { revealed: true }
  })

  handle(IPC_CHANNELS.appOpenPath, async (payload) => {
    const { path } = parsePayload(zPathRequest, payload)
    if (!existsSync(path)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That file no longer exists.')
    }
    const error = await shell.openPath(path)
    if (error) throw new AppError(ERROR_CODES.FILE_WRITE_ERROR, error)
    return { opened: true }
  })

  handle(IPC_CHANNELS.appCreatePrivateWindow, () => {
    const workspace = services.ensurePrivateWorkspace()
    const context = services.windows.createPrivateWindow(workspace)
    return { windowId: context.id }
  })

  handle(IPC_CHANNELS.appQuit, () => {
    app.quit()
    return { quitting: true }
  })

  handle(IPC_CHANNELS.appSaveTextFile, async (payload, context) => {
    const request = parsePayload(zSaveTextFileRequest, payload)
    const fileName = request.fileName ?? 'export.txt'
    const filters = request.filters ?? [{ name: 'Text', extensions: ['txt'] }]
    const result = await dialog.showSaveDialog(context.window, {
      defaultPath: fileName,
      filters
    })
    if (result.canceled || !result.filePath) return { saved: false, path: null }
    const { writeFile } = await import('node:fs/promises')
    await writeFile(result.filePath, request.content, 'utf8')
    return { saved: true, path: result.filePath }
  })

  handle(IPC_CHANNELS.appOpenTextFile, async (payload, context) => {
    const request = parsePayload(zOpenTextFileRequest, payload ?? {})
    const filters = request.filters ?? [{ name: 'All files', extensions: ['*'] }]
    const result = await dialog.showOpenDialog(context.window, {
      properties: ['openFile'],
      filters
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    if (!filePath) return null
    const { readFile, stat } = await import('node:fs/promises')
    const stats = await stat(filePath)
    if (stats.size > 5 * 1024 * 1024) {
      throw new AppError(
        ERROR_CODES.INVALID_ARGUMENT,
        'That file is larger than the 5 MB import limit.'
      )
    }
    const content = await readFile(filePath, 'utf8')
    return { content, fileName: filePath.split(/[\\/]/).pop() ?? 'import' }
  })

  /* ---------------------------------------------------------- window --- */

  handle(IPC_CHANNELS.windowMinimize, (_payload, context) => {
    context.window.minimize()
  })

  handle(IPC_CHANNELS.windowToggleMaximize, (_payload, context) => {
    if (context.window.isMaximized()) context.window.unmaximize()
    else context.window.maximize()
    return { maximized: context.window.isMaximized() }
  })

  handle(IPC_CHANNELS.windowClose, (_payload, context) => {
    context.window.close()
  })

  handle(IPC_CHANNELS.windowIsMaximized, (_payload, context) => ({
    maximized: context.window.isMaximized()
  }))

  handle(IPC_CHANNELS.windowSetTitle, (payload, context) => {
    const { title } = parsePayload(zWindowTitleRequest, payload)
    if (!context.window.isDestroyed()) {
      context.window.setTitle(title)
    }
    return { title }
  })

  handle(IPC_CHANNELS.windowSetTheme, (payload, context) => {
    const { theme } = parsePayload(zWindowThemeRequest, payload)
    if (!context.window.isDestroyed()) {
      context.window.setTitleBarOverlay?.({
        color: '#00000000',
        symbolColor: theme === 'dark' ? '#98a2b3' : '#4a5364',
        height: 40
      })
    }
    return { theme }
  })

  /* ------------------------------------------------------------ tabs --- */

  handle(IPC_CHANNELS.tabsList, (_payload, context) => context.tabs.listAll())

  handle(IPC_CHANNELS.tabsCreate, (payload, context) => {
    const request = parsePayload(zCreateTabRequest, payload)
    const url = request.url ?? services.settings.getAll().homePage
    const tab = context.tabs.createTab({
      url,
      workspaceId: request.workspaceId ?? context.workspaceId,
      activate: request.activate ?? !request.background
    })
    return tab
  })

  handle(IPC_CHANNELS.tabsClose, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const closed = context.tabs.closeTab(tabId)
    return { closed }
  })

  handle(IPC_CHANNELS.tabsActivate, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const tab = context.tabs.activateTab(tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return tab
  })

  handle(IPC_CHANNELS.tabsMove, (payload, context) => {
    const request = parsePayload(zTabIndexRequest, payload)
    const tab = context.tabs.getTab(request.tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    const ids = context.tabs.listTabs(tab.workspaceId).map((item) => item.id)
    const current = ids.indexOf(request.tabId)
    if (current >= 0) ids.splice(current, 1)
    ids.splice(Math.max(0, Math.min(request.toIndex, ids.length)), 0, request.tabId)
    return context.tabs.reorder(tab.workspaceId, ids)
  })

  handle(IPC_CHANNELS.tabsMoveToWorkspace, (payload, context) => {
    const request = parsePayload(zTabWorkspaceRequest, payload)
    return context.tabs.moveToWorkspace(request.tabId, request.workspaceId)
  })

  handle(IPC_CHANNELS.tabsSetPinned, (payload, context) => {
    const request = parsePayload(zTabPinnedRequest, payload)
    const tab = context.tabs.setPinned(request.tabId, request.pinned)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return tab
  })

  handle(IPC_CHANNELS.tabsSetMuted, (payload, context) => {
    const request = parsePayload(zTabMutedRequest, payload)
    const tab = context.tabs.setMuted(request.tabId, request.muted)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return tab
  })

  handle(IPC_CHANNELS.tabsDuplicate, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const tab = context.tabs.duplicateTab(tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return tab
  })

  handle(IPC_CHANNELS.tabsReorder, (payload, context) => {
    const request = parsePayload(zTabIdsRequest, payload)
    const ids = request.tabIds
    const first = ids.length > 0 ? context.tabs.getTab(ids[0] as string) : null
    const workspaceId = first?.workspaceId ?? context.workspaceId
    return context.tabs.reorder(workspaceId, ids)
  })

  handle(IPC_CHANNELS.tabsGroups, (payload, context) => {
    const request = parsePayload(zWorkspaceIdRequest, payload ?? {})
    const workspaceId = request.workspaceId ?? context.workspaceId
    return services.workspaces.listGroups(workspaceId)
  })

  handle(IPC_CHANNELS.tabsCreateGroup, (payload, context) => {
    const request = parsePayload(zGroupCreateRequest, payload)
    const workspaceId = request.workspaceId ?? context.workspaceId
    const color = request.color ?? '#8b5cf6'
    return services.workspaces.createGroup({ workspaceId, name: request.name.trim(), color })
  })

  handle(IPC_CHANNELS.tabsUpdateGroup, (payload) => {
    const request = parsePayload(zGroupUpdateRequest, payload)
    const patch: { name?: string; color?: string; collapsed?: boolean } = {}
    if (request.name) patch.name = request.name.trim()
    if (request.color) patch.color = request.color
    if (request.collapsed !== undefined) patch.collapsed = request.collapsed
    const group = services.workspaces.updateGroup(request.groupId, patch)
    if (!group) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab group no longer exists.')
    return group
  })

  handle(IPC_CHANNELS.tabsDeleteGroup, (payload) => {
    const { groupId } = parsePayload(zGroupIdRequest, payload)
    return { deleted: services.workspaces.deleteGroup(groupId) }
  })

  handle(IPC_CHANNELS.tabsAssignToGroup, (payload, context) => {
    const request = parsePayload(zTabGroupAssignRequest, payload)
    const tab = context.tabs.getTab(request.tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    tab.groupId = request.groupId
    services.workspaces.updateTab(tab.id, { groupId: request.groupId })
    return tab
  })

  /* ------------------------------------------------------- navigation --- */

  handle(IPC_CHANNELS.navNavigate, (payload, context) => {
    const request = parsePayload(zNavigateRequest, payload)
    const settings = services.settings.getAll()
    const tab = context.tabs.getTab(request.tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')

    // Internal pages are part of the application shell. They are not
    // navigable destinations for Chromium, so they are handled directly.
    if (isInternalUrl(request.url)) {
      const route = request.url.trim()
      context.tabs.navigate(request.tabId, route)
      return { url: route }
    }

    const destination = resolveDestination(request.url, {
      searchEngineId: settings.searchEngineId,
      customSearchTemplate: settings.customSearchTemplate
    })
    if ('error' in destination) {
      throw new AppError(ERROR_CODES.BLOCKED_SCHEME, destination.error)
    }
    context.tabs.navigate(request.tabId, destination.url)
    return { url: destination.url }
  })

  handle(IPC_CHANNELS.navGoBack, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = contentsOfTab(context, tabId)
    contents?.navigationHistory.goBack()
    return context.tabs.getTab(tabId)!
  })

  handle(IPC_CHANNELS.navGoForward, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = contentsOfTab(context, tabId)
    contents?.navigationHistory.goForward()
    return context.tabs.getTab(tabId)!
  })

  handle(IPC_CHANNELS.navReload, (payload, context) => {
    const request = parsePayload(zTabReloadRequest, payload)
    const contents = contentsOfTab(context, request.tabId)
    if (contents) {
      if (request.hard) contents.reloadIgnoringCache()
      else contents.reload()
    }
    return context.tabs.getTab(request.tabId)!
  })

  handle(IPC_CHANNELS.navStop, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = contentsOfTab(context, tabId)
    contents?.stop()
    return context.tabs.getTab(tabId)!
  })

  handle(IPC_CHANNELS.navHome, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const home = services.settings.getAll().homePage
    context.tabs.navigate(tabId, home)
    return { url: home }
  })

  handle(IPC_CHANNELS.navOpenInNewTab, (payload, context) => {
    const request = parsePayload(zOpenInNewTabRequest, payload)
    if (isDangerousUrl(request.url)) {
      throw new AppError(ERROR_CODES.BLOCKED_SCHEME, 'That link cannot be opened in a tab.')
    }
    const tab = context.tabs.createTab({
      url: request.url,
      workspaceId: request.workspaceId ?? context.workspaceId
    })
    return tab
  })

  handle(IPC_CHANNELS.navFindInPage, async (payload, context) => {
    const request = parsePayload(zFindInPageRequest, payload)
    const contents = contentsOfTab(context, request.tabId)
    if (!contents) {
      throw new AppError(ERROR_CODES.NOT_SUPPORTED, 'This page cannot be searched.')
    }

    // Electron 45 reports the results through the `found-in-page` event; the
    // call itself only returns the request id.
    const requestId = contents.findInPage(request.query, {
      forward: request.forward,
      findNext: request.findNext
    })

    const result = await new Promise<Electron.FoundInPageResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        contents.off('found-in-page', listener)
        reject(new AppError(ERROR_CODES.TIMEOUT, 'The find operation did not report any result.'))
      }, 5000)

      const listener = (_event: Electron.Event, found: Electron.FoundInPageResult): void => {
        if (found.requestId !== requestId) return
        if (!found.finalUpdate) return
        clearTimeout(timer)
        contents.off('found-in-page', listener)
        resolve(found)
      }

      contents.on('found-in-page', listener)
    })

    return {
      requestId: result.requestId,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      selectionArea: result.selectionArea ?? null,
      finalUpdate: result.finalUpdate
    }
  })

  handle(IPC_CHANNELS.navStopFindInPage, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = services.tabContents(context, tabId)
    contents?.stopFindInPage('clearSelection')
    return { stopped: true }
  })

  handle(IPC_CHANNELS.navPrint, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = contentsOfTab(context, tabId)
    if (!contents) {
      throw new AppError(ERROR_CODES.NOT_SUPPORTED, 'This page cannot be printed.')
    }
    contents.print({ silent: false, printBackground: true })
    return { started: true }
  })

  handle(IPC_CHANNELS.navExtractReaderContent, async (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const extractor = services.contextExtractor(context)
    const payloadResult = await extractor.extractReadable(tabId)
    const contents = services.tabContents(context, tabId)
    return {
      available: payloadResult.ok,
      title: payloadResult.title ?? contents?.getTitle() ?? null,
      byline: payloadResult.byline ?? null,
      text: payloadResult.text ?? '',
      wordCount: payloadResult.wordCount ?? 0,
      reason: payloadResult.reason ?? null
    }
  })

  handle(IPC_CHANNELS.navZoomIn, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const tab = context.tabs.getTab(tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return context.tabs.setZoom(tab.id, tab.zoomFactor + 0.1)!
  })

  handle(IPC_CHANNELS.navZoomOut, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const tab = context.tabs.getTab(tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return context.tabs.setZoom(tab.id, tab.zoomFactor - 0.1)!
  })

  handle(IPC_CHANNELS.navResetZoom, (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const tab = context.tabs.getTab(tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return context.tabs.setZoom(tab.id, 1)!
  })

  handle(IPC_CHANNELS.navSetZoom, (payload, context) => {
    const request = parsePayload(zZoomRequest, payload)
    const tab = context.tabs.getTab(request.tabId)
    if (!tab) throw new AppError(ERROR_CODES.NOT_FOUND, 'That tab no longer exists.')
    return context.tabs.setZoom(tab.id, request.factor)!
  })

  handle(IPC_CHANNELS.navTogglePictureInPicture, async (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const contents = contentsOfTab(context, tabId)
    if (!contents) {
      throw new AppError(
        ERROR_CODES.NOT_SUPPORTED,
        'Picture-in-picture is only available for websites.'
      )
    }

    // Electron exposes picture-in-picture through the media element API only,
    // so the request is forwarded to the page's own video element.
    const status = (await contents.executeJavaScript(PICTURE_IN_PICTURE_SCRIPT)) as {
      ok: boolean
      active: boolean
      reason: string | null
    }

    if (!status?.ok) {
      throw new AppError(
        ERROR_CODES.NOT_SUPPORTED,
        status?.reason ?? 'This page has no video that supports picture-in-picture.'
      )
    }
    return { active: status.active }
  })

  /* ----------------------------------------------------------- layout --- */

  handle(IPC_CHANNELS.layoutSetViews, (payload, context) => {
    const request = parsePayload(zViewLayoutRequest, payload)
    context.views.applyLayout(context.window, request.entries)
  })

  /* ------------------------------------------------------- bookmarks --- */

  handle(IPC_CHANNELS.bookmarksList, () => services.bookmarks.list())

  handle(IPC_CHANNELS.bookmarksCreate, (payload) => {
    const request = parsePayload(zBookmarkRequest, payload)
    return services.bookmarks.create({
      title: request.title,
      url: request.url,
      parentId: request.parentId ?? null
    })
  })

  handle(IPC_CHANNELS.bookmarksCreateFolder, (payload) => {
    const request = parsePayload(zBookmarkFolderRequest, payload)
    return services.bookmarks.createFolder({
      title: request.title,
      parentId: request.parentId ?? null
    })
  })

  handle(IPC_CHANNELS.bookmarksUpdate, (payload) => {
    const request = parsePayload(zBookmarkUpdateRequest, payload)
    const updated = services.bookmarks.update(request.id, {
      title: request.title,
      url: request.url
    })
    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'That bookmark no longer exists.')
    return updated
  })

  handle(IPC_CHANNELS.bookmarksDelete, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.bookmarks.delete(id) }
  })

  handle(IPC_CHANNELS.bookmarksMove, (payload) => {
    const request = parsePayload(zBookmarkMoveRequest, payload)
    const moved = services.bookmarks.move(request.id, request.parentId, request.position)
    if (!moved) throw new AppError(ERROR_CODES.NOT_FOUND, 'That bookmark could not be moved.')
    return moved
  })

  handle(IPC_CHANNELS.bookmarksReorder, (payload) => {
    const request = parsePayload(zBookmarkReorderRequest, payload)
    return services.bookmarks.reorder(request.parentId, request.orderedIds)
  })

  handle(IPC_CHANNELS.bookmarksSearch, (payload) => {
    const { query } = parsePayload(zBookmarkSearchRequest, payload ?? {})
    return services.bookmarks.search(query)
  })

  handle(IPC_CHANNELS.bookmarksExport, (payload) => {
    const request = parsePayload(zBookmarkExportRequest, payload ?? {})
    const bookmarks = services.bookmarks.list()
    return request.format === 'html'
      ? exportBookmarksHtml(bookmarks)
      : exportBookmarksJson(bookmarks)
  })

  handle(IPC_CHANNELS.bookmarksImport, (payload) => {
    const request = parsePayload(zImportRequest, payload)
    const { bookmarks, errors } = importBookmarks(request.content, request.fileName)
    const imported = services.bookmarks.insertMany(bookmarks)
    return { imported, skipped: errors.length, errors }
  })

  /* ---------------------------------------------------------- history --- */

  handle(IPC_CHANNELS.historyQuery, (payload) => {
    const request = parsePayload(zHistoryQueryRequest, payload ?? {})
    return services.history.query(request)
  })

  handle(IPC_CHANNELS.historyRemove, (payload) => {
    const request = parsePayload(zHistoryRemoveRequest, payload)
    return { removed: services.history.remove(request.ids) }
  })

  handle(IPC_CHANNELS.historyClear, (payload) => {
    const request = parsePayload(zHistoryClearRequest, payload ?? {})
    return { removed: services.history.clear(request.range) }
  })

  handle(IPC_CHANNELS.historyExport, () => {
    const entries = services.history.query({ limit: 5000 })
    return {
      fileName: `nexus-history-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify({ format: 'nexus-history', version: 1, entries }, null, 2)
    }
  })

  /* ------------------------------------------------------- workspaces --- */

  handle(IPC_CHANNELS.workspacesList, () => services.workspaces.list())

  handle(IPC_CHANNELS.workspacesCreate, (payload) => {
    const request = parsePayload(zWorkspaceCreateRequest, payload)
    return services.workspaces.create({
      name: request.name.trim(),
      icon: request.icon ?? 'globe',
      color: request.color ?? '#8b5cf6',
      layout: request.layout ?? 'single'
    })
  })

  handle(IPC_CHANNELS.workspacesUpdate, (payload) => {
    const request = parsePayload(zWorkspaceUpdateRequest, payload)
    const patch: {
      name?: string
      icon?: string
      color?: string
      layout?: 'single' | 'split-vertical' | 'split-horizontal'
    } = {}
    if (request.name) patch.name = request.name.trim()
    if (request.icon) patch.icon = request.icon
    if (request.color) patch.color = request.color
    if (request.layout) patch.layout = request.layout
    const updated = services.workspaces.update(request.id, patch)
    if (!updated) throw new AppError(ERROR_CODES.NOT_FOUND, 'That workspace no longer exists.')
    services.broadcastWorkspaces()
    return updated
  })

  handle(IPC_CHANNELS.workspacesDelete, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    const workspace = services.workspaces.get(id)
    if (!workspace) throw new AppError(ERROR_CODES.NOT_FOUND, 'That workspace no longer exists.')
    if (workspace.isDefault) {
      throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'The default workspace cannot be deleted.')
    }

    // A fallback is needed before the row disappears: the tabs of the removed
    // workspace are closed and every window that showed it switches over.
    const remaining = services.workspaces.list().filter((item) => item.id !== id)
    const fallback = remaining.find((item) => item.isDefault) ?? remaining[0]
    if (!fallback) {
      throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'This is the only workspace.')
    }

    services.windows.removeWorkspace(id, fallback.id)

    // A deleted workspace must not stay referenced by the settings.
    if (services.settings.getAll().defaultWorkspaceId === id) {
      services.settings.set('defaultWorkspaceId', fallback.id)
    }

    const deleted = services.workspaces.delete(id)
    if (deleted) services.broadcastWorkspaces()
    return { deleted }
  })

  handle(IPC_CHANNELS.workspacesReorder, (payload) => {
    const request = parsePayload(zWorkspaceIdsRequest, payload)
    const ordered = services.workspaces.reorder(request.ids)
    services.broadcastWorkspaces()
    return ordered
  })

  handle(IPC_CHANNELS.workspacesSetDefault, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    const workspace = services.workspaces.setDefault(id)
    if (!workspace) throw new AppError(ERROR_CODES.NOT_FOUND, 'That workspace no longer exists.')
    services.settings.set('defaultWorkspaceId', workspace.id)
    services.broadcastWorkspaces()
    return workspace
  })

  handle(IPC_CHANNELS.workspacesActivate, (payload, context) => {
    const { id } = parsePayload(zIdSchema, payload)
    const workspace = services.workspaces.get(id)
    if (!workspace) throw new AppError(ERROR_CODES.NOT_FOUND, 'That workspace no longer exists.')
    context.workspaceId = workspace.id
    context.tabs.setWorkspace(workspace.id)
    const first = context.tabs.listTabs(workspace.id)[0]
    if (first) context.tabs.activateTab(first.id)
    services.windows.send(context, 'workspace:activated', { workspaceId: workspace.id })
    return { workspaceId: workspace.id }
  })

  handle(IPC_CHANNELS.workspacesSaveSession, (payload, context) => {
    const request = parsePayload(zSaveSessionRequest, payload ?? {})
    const name = request.name ? request.name.trim() : 'Session'
    const workspaceId = request.workspaceId ?? context.workspaceId
    const session = services.sessions.createSession(name, workspaceId)
    const tabs = context.tabs.listTabs(workspaceId)
    tabs.forEach((tab, index) => {
      services.sessions.addSessionTab({
        sessionId: session.id,
        tabId: tab.id,
        url: tab.url || tab.pendingUrl || '',
        title: tab.title,
        position: index,
        groupId: tab.groupId
      })
    })
    return session
  })

  handle(IPC_CHANNELS.workspacesListSessions, () => services.sessions.listSessions())

  handle(IPC_CHANNELS.workspacesRenameSession, (payload) => {
    const request = parsePayload(zRenameSessionRequest, payload)
    const session = services.sessions.renameSession(request.id, request.name.trim() || 'Session')
    if (!session) throw new AppError(ERROR_CODES.NOT_FOUND, 'That session no longer exists.')
    return session
  })

  handle(IPC_CHANNELS.workspacesDeleteSession, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.sessions.deleteSession(id) }
  })

  handle(IPC_CHANNELS.workspacesRestoreSession, (payload, context) => {
    const { id } = parsePayload(zIdSchema, payload)
    const session = services.sessions.getSession(id)
    if (!session) throw new AppError(ERROR_CODES.NOT_FOUND, 'That session no longer exists.')
    const tabs = services.sessions.listSessionTabs(id)
    const created: ReturnType<BrowserContext['tabs']['createTab']>[] = []
    for (const tab of tabs) {
      if (!tab.url) continue
      created.push(
        context.tabs.createTab({
          url: tab.url,
          title: tab.title,
          workspaceId: context.workspaceId
        })
      )
    }
    if (created.length > 0) context.tabs.activateTab(created[0]!.id)
    return created
  })

  /* --------------------------------------------------------- downloads --- */

  handle(IPC_CHANNELS.downloadsList, () => services.downloadManager.list())

  handle(IPC_CHANNELS.downloadsCancel, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return services.downloadManager.cancel(id)
  })

  handle(IPC_CHANNELS.downloadsOpen, async (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { opened: await services.downloadManager.open(id) }
  })

  handle(IPC_CHANNELS.downloadsReveal, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { revealed: services.downloadManager.reveal(id) }
  })

  handle(IPC_CHANNELS.downloadsClear, (payload) => {
    const request = parsePayload(zDownloadClearRequest, payload ?? {})
    return { cleared: services.downloadManager.clear(request.id) }
  })

  handle(IPC_CHANNELS.downloadsChooseDirectory, async (_payload, context) => {
    const directory = await services.downloadManager.chooseDirectory(context.window)
    if (directory) services.settings.set('downloadDirectory', directory)
    return { directory }
  })

  /* ---------------------------------------------------------- settings --- */

  handle(IPC_CHANNELS.settingsGet, () => services.settings.getAll())

  handle(IPC_CHANNELS.settingsSet, (payload) => {
    const request = parsePayload(zSettingsPatchRequest, payload)
    const settings = services.settings.setMany(request.patch)
    services.applySettings(settings)
    return settings
  })

  handle(IPC_CHANNELS.settingsReset, () => {
    const settings = services.settings.reset()
    services.applySettings(settings)
    return settings
  })

  handle(IPC_CHANNELS.settingsClearBrowsingData, async (payload) => {
    const request = parsePayload(zClearBrowsingDataRequest, payload ?? {})
    const scope = request.scope ?? 'all'
    const cleared: string[] = []
    if (scope === 'history' || scope === 'all') {
      services.history.clear()
      cleared.push('history')
    }
    if (scope === 'downloads' || scope === 'all') {
      services.downloadManager.clear()
      cleared.push('downloads')
    }
    if (scope === 'cache' || scope === 'all') {
      await services.clearCache()
      cleared.push('cache')
    }
    if (scope === 'cookies' || scope === 'all') {
      await services.clearCookies()
      cleared.push('cookies')
    }
    return { cleared }
  })

  handle(IPC_CHANNELS.settingsExportData, () => {
    const payload = {
      format: 'nexus-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: services.settings.getAll(),
      workspaces: services.workspaces.list(),
      bookmarks: services.bookmarks.list(),
      history: services.history.query({ limit: 5000 }),
      snippets: services.snippets.list(),
      collections: services.collections.listCollections(),
      requests: services.collections.listRequests(),
      conversations: services.ai.listConversations()
    }
    return {
      fileName: `nexus-data-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(payload, null, 2)
    }
  })

  /* ------------------------------------------------------- permissions --- */

  handle(IPC_CHANNELS.permissionsList, () => services.permissions.list())

  handle(IPC_CHANNELS.permissionsSet, (payload) => {
    const request = parsePayload(zPermissionSetRequest, payload)
    return services.permissions.set(request.origin, request.permission, request.decision)
  })

  handle(IPC_CHANNELS.permissionsReset, () => ({ cleared: services.permissions.reset() }))

  handle(IPC_CHANNELS.permissionsRespond, (payload) => {
    const request = parsePayload(zPermissionRespondRequest, payload)
    return {
      resolved: services.permissionManager.respond(
        request.requestId,
        request.allow,
        request.remember ?? true
      )
    }
  })

  /* ---------------------------------------------------------------- ai --- */

  handle(IPC_CHANNELS.aiGetProviderConfig, () => services.ai.config)

  handle(IPC_CHANNELS.aiSaveProviderConfig, (payload) => {
    const request = parsePayload(zAiProviderConfigRequest, payload)
    const result = services.ai.saveConfig(request.config, request.apiKey)
    if (result.warning) logger.warn(result.warning)
    return result.config
  })

  handle(IPC_CHANNELS.aiTestProvider, async () => services.ai.testConnection())

  handle(IPC_CHANNELS.aiListConversations, () => services.ai.listConversations())

  handle(IPC_CHANNELS.aiCreateConversation, (payload) => {
    const request = parsePayload(zAiConversationTitleRequest, payload ?? {})
    const config = services.ai.config
    const conversation = services.ai.createConversation({
      title: request.title ?? 'New conversation',
      providerId: config.providerId,
      model: config.model
    })
    return conversation
  })

  handle(IPC_CHANNELS.aiRenameConversation, (payload) => {
    const request = parsePayload(zAiRenameConversationRequest, payload)
    const conversation = services.ai.renameConversation(request.id, request.title.trim())
    if (!conversation)
      throw new AppError(ERROR_CODES.NOT_FOUND, 'That conversation no longer exists.')
    return conversation
  })

  handle(IPC_CHANNELS.aiDeleteConversation, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.ai.deleteConversation(id) }
  })

  handle(IPC_CHANNELS.aiClearConversation, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.ai.clearConversation(id) }
  })

  handle(IPC_CHANNELS.aiListMessages, (payload) => {
    const { conversationId } = parsePayload(zAiConversationIdRequest, payload)
    return services.ai.listMessages(conversationId)
  })

  handle(IPC_CHANNELS.aiSend, async (payload, context) => {
    const request = parsePayload(zAiSendRequest, payload)
    const persist = services.settings.getAll().saveAiConversations
    return services.ai.send(
      {
        conversationId: request.conversationId,
        prompt: request.prompt,
        actionId: request.actionId ?? null,
        context: request.context,
        persist
      },
      (event) => {
        services.windows.send(context, channelForAiEvent(event.type), {
          conversationId: event.conversationId,
          messageId: event.messageId,
          delta: event.delta ?? '',
          message: event.message ?? '',
          usage: event.usage ?? null
        })
      }
    )
  })

  handle(IPC_CHANNELS.aiStop, (payload) => {
    const { conversationId } = parsePayload(zAiConversationIdRequest, payload)
    return { stopped: services.ai.stop(conversationId) }
  })

  handle(IPC_CHANNELS.aiExtractContext, async (payload, context) => {
    const request = parsePayload(zAiExtractContextRequest, payload)
    const extractor = services.contextExtractor(context)
    const items = await extractor.buildBundle(request.tabIds, {
      includeSelection: request.includeSelection,
      includeReadable: request.includeReadable
    })
    return {
      items,
      totalCharacters: items.reduce((sum, item) => sum + item.characters, 0)
    }
  })

  handle(IPC_CHANNELS.aiGetSelection, async (payload, context) => {
    const { tabId } = parsePayload(zTabIdSchema, payload)
    const extractor = services.contextExtractor(context)
    const text = await extractor.extractSelection(tabId)
    return { text }
  })

  /* ---------------------------------------------------- developer kit --- */

  handle(IPC_CHANNELS.devListFolders, () => services.snippets.listFolders())

  handle(IPC_CHANNELS.devCreateFolder, (payload) => {
    const { name } = parsePayload(zNameRequest, payload)
    return services.snippets.createFolder(name.trim())
  })

  handle(IPC_CHANNELS.devDeleteFolder, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.snippets.deleteFolder(id) }
  })

  handle(IPC_CHANNELS.devListSnippets, (payload) => {
    const request = parsePayload(zSnippetListRequest, payload ?? {})
    return services.snippets.list({
      search: request.search,
      folderId: request.folderId,
      tag: request.tag
    })
  })

  handle(IPC_CHANNELS.devSaveSnippet, (payload) => {
    const request = parsePayload(zSnippetSaveRequest, payload)
    return services.snippets.save({
      id: request.id,
      title: request.title,
      description: request.description,
      code: request.code,
      language: request.language,
      folderId: request.folderId,
      tags: request.tags,
      favorite: request.favorite
    })
  })

  handle(IPC_CHANNELS.devDeleteSnippet, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.snippets.delete(id) }
  })

  handle(IPC_CHANNELS.devListCollections, () => services.collections.listCollections())

  handle(IPC_CHANNELS.devCreateCollection, (payload) => {
    const request = parsePayload(zCollectionCreateRequest, payload)
    return services.collections.createCollection(request.name.trim(), request.description ?? '')
  })

  handle(IPC_CHANNELS.devUpdateCollection, (payload) => {
    const request = parsePayload(zCollectionUpdateRequest, payload)
    const patch: { name?: string; description?: string } = {}
    if (request.name) patch.name = request.name.trim()
    if (request.description !== undefined) patch.description = request.description
    const collection = services.collections.updateCollection(request.id, patch)
    if (!collection) throw new AppError(ERROR_CODES.NOT_FOUND, 'That collection no longer exists.')
    return collection
  })

  handle(IPC_CHANNELS.devDeleteCollection, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.collections.deleteCollection(id) }
  })

  handle(IPC_CHANNELS.devListRequests, (payload) => {
    const request = parsePayload(zRequestListRequest, payload ?? {})
    return services.collections.listRequests(request.collectionId)
  })

  handle(IPC_CHANNELS.devSaveRequest, (payload) => {
    const request = parsePayload(zApiRequestRecordRequest, payload)
    return services.collections.saveRequest({
      id: request.id,
      collectionId: request.record.collectionId,
      name: request.record.name,
      method: request.record.method,
      url: request.record.url,
      query: request.record.query,
      headers: request.record.headers,
      bodyType: request.record.bodyType,
      body: request.record.body,
      notes: request.record.notes
    })
  })

  handle(IPC_CHANNELS.devDeleteRequest, (payload) => {
    const { id } = parsePayload(zIdSchema, payload)
    return { deleted: services.collections.deleteRequest(id) }
  })

  handle(IPC_CHANNELS.devSendRequest, async (payload) => {
    const request = parsePayload(zApiRequestPayload, payload)
    const result = await services.http.send(request)
    services.httpHistory.add({
      method: request.method,
      url: request.url,
      status: result.response?.status ?? null,
      durationMs: result.durationMs,
      error: result.error
    })
    return {
      response: result.response,
      error: result.error,
      requestId: result.requestId
    }
  })

  handle(IPC_CHANNELS.devCancelRequest, (payload) => {
    const { requestId } = parsePayload(zRequestCancelRequest, payload)
    return { cancelled: services.http.cancel(requestId) }
  })

  handle(IPC_CHANNELS.devHttpHistory, () => services.httpHistory.list())

  handle(IPC_CHANNELS.devClearHttpHistory, () => ({ cleared: services.httpHistory.clear() }))

  handle(IPC_CHANNELS.devExportCollections, () =>
    exportCollections(services.collections.listCollections(), services.collections.listRequests())
  )

  handle(IPC_CHANNELS.devImportCollections, (payload) => {
    const request = parsePayload(zImportRequest, payload)
    const { collections, errors } = importCollections(request.content)
    let imported = 0
    for (const collection of collections) {
      const created = services.collections.createCollection(collection.name, collection.description)
      for (const item of collection.requests) {
        const method = HTTP_METHODS.find((candidate) => candidate === item.method) ?? 'GET'
        const bodyType = BODY_TYPES.find((candidate) => candidate === item.bodyType) ?? 'none'
        services.collections.saveRequest({
          collectionId: created.id,
          name: item.name,
          method,
          url: item.url,
          query: Array.isArray(item.query) ? (item.query as never) : [],
          headers: Array.isArray(item.headers) ? (item.headers as never) : [],
          bodyType,
          body: item.body,
          notes: item.notes
        })
        imported += 1
      }
    }
    return { imported, skipped: errors.length, errors }
  })
}

function channelForAiEvent(type: 'chunk' | 'done' | 'error' | 'cancelled'): string {
  switch (type) {
    case 'chunk':
      return 'ai:chunk'
    case 'done':
      return 'ai:done'
    case 'error':
      return 'ai:error'
    case 'cancelled':
      return 'ai:cancelled'
    default:
      return 'ai:chunk'
  }
}

/** Small helper used by the download manager to build default paths. */
export function defaultDownloadPath(fileName: string): string {
  return join(app.getPath('downloads'), fileName)
}
