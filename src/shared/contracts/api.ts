/**
 * Typed API surface exposed to the renderer.
 *
 * The renderer never touches `ipcRenderer` directly. It receives this object
 * through the context bridge, which means every privileged operation is
 * explicitly enumerated, typed and validated on the main-process side.
 */

import type { IpcEvents, IpcRequests } from './ipc'
import type { ErrorCode } from '../errors'
import type {
  ApiCollection,
  ApiRequestRecord,
  AppSettings,
  Bookmark,
  DownloadRecord,
  HistoryEntry,
  HttpRequestHistoryEntry,
  HttpRequestPayload,
  HttpResponsePayload,
  PermissionDecisionRecord,
  SavedSession,
  Snippet,
  SnippetFolder,
  TabGroup,
  TabState,
  Workspace
} from '../types'
import type {
  AiCompletionResult,
  AiContextBundle,
  AiConversation,
  AiMessage,
  AiProviderConfig
} from '../types'

/** Error thrown when a privileged operation fails in the main process. */
export class NexusApiError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'NexusApiError'
    this.code = code
    this.details = details

    // The error crosses the context bridge as a plain value. `Error` defines
    // `message` as a non-enumerable own property, which would be dropped while
    // the error is copied, leaving the renderer without a readable message.
    Object.defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true
    })
  }
}

export interface NexusApi {
  app: {
    getInfo(): Promise<IpcRequests['app:getInfo']['response']>
    openExternal(url: string): Promise<IpcRequests['app:openExternal']['response']>
    revealPath(path: string): Promise<IpcRequests['app:revealPath']['response']>
    openPath(path: string): Promise<IpcRequests['app:openPath']['response']>
    createPrivateWindow(): Promise<IpcRequests['app:createPrivateWindow']['response']>
    quit(): Promise<IpcRequests['app:quit']['response']>
    saveTextFile(
      content: string,
      fileName: string,
      filters?: Array<{ name: string; extensions: string[] }>
    ): Promise<IpcRequests['app:saveTextFile']['response']>
    openTextFile(
      filters?: Array<{ name: string; extensions: string[] }>
    ): Promise<IpcRequests['app:openTextFile']['response']>
  }
  window: {
    minimize(): Promise<IpcRequests['window:minimize']['response']>
    toggleMaximize(): Promise<IpcRequests['window:toggleMaximize']['response']>
    close(): Promise<IpcRequests['window:close']['response']>
    isMaximized(): Promise<IpcRequests['window:isMaximized']['response']>
    setTitle(title: string): Promise<IpcRequests['window:setTitle']['response']>
    setTheme(theme: 'dark' | 'light'): Promise<IpcRequests['window:setTheme']['response']>
  }
  tabs: {
    list(): Promise<TabState[]>
    create(options?: {
      url?: string
      workspaceId?: string
      activate?: boolean
      background?: boolean
    }): Promise<TabState>
    close(tabId: string): Promise<IpcRequests['tabs:close']['response']>
    activate(tabId: string): Promise<TabState>
    move(tabId: string, toIndex: number): Promise<TabState[]>
    moveToWorkspace(tabId: string, workspaceId: string): Promise<TabState[]>
    setPinned(tabId: string, pinned: boolean): Promise<TabState>
    setMuted(tabId: string, muted: boolean): Promise<TabState>
    duplicate(tabId: string): Promise<TabState>
    reorder(tabIds: string[]): Promise<TabState[]>
    groups(workspaceId: string): Promise<TabGroup[]>
    createGroup(workspaceId: string, name: string, color: string): Promise<TabGroup>
    updateGroup(
      groupId: string,
      patch: { name?: string; color?: string; collapsed?: boolean }
    ): Promise<TabGroup>
    deleteGroup(groupId: string): Promise<IpcRequests['tabs:deleteGroup']['response']>
    assignToGroup(tabId: string, groupId: string | null): Promise<TabState>
  }
  nav: {
    navigate(tabId: string, url: string): Promise<IpcRequests['nav:navigate']['response']>
    goBack(tabId: string): Promise<TabState>
    goForward(tabId: string): Promise<TabState>
    reload(tabId: string, hard?: boolean): Promise<TabState>
    stop(tabId: string): Promise<TabState>
    home(tabId: string): Promise<IpcRequests['nav:home']['response']>
    openInNewTab(url: string, workspaceId?: string): Promise<TabState>
    findInPage(
      tabId: string,
      query: string,
      forward?: boolean,
      findNext?: boolean
    ): Promise<IpcRequests['nav:findInPage']['response']>
    stopFindInPage(tabId: string): Promise<IpcRequests['nav:stopFindInPage']['response']>
    print(tabId: string): Promise<IpcRequests['nav:print']['response']>
    extractReaderContent(
      tabId: string
    ): Promise<IpcRequests['nav:extractReaderContent']['response']>
    zoomIn(tabId: string): Promise<TabState>
    zoomOut(tabId: string): Promise<TabState>
    resetZoom(tabId: string): Promise<TabState>
    setZoom(tabId: string, factor: number): Promise<TabState>
    togglePictureInPicture(
      tabId: string
    ): Promise<IpcRequests['nav:togglePictureInPicture']['response']>
  }
  layout: {
    setViews(entries: IpcRequests['layout:setViews']['request']['entries']): Promise<void>
  }
  bookmarks: {
    list(): Promise<Bookmark[]>
    create(title: string, url: string, parentId?: string | null): Promise<Bookmark>
    createFolder(title: string, parentId?: string | null): Promise<Bookmark>
    update(id: string, patch: { title?: string; url?: string }): Promise<Bookmark>
    remove(id: string): Promise<IpcRequests['bookmarks:delete']['response']>
    move(id: string, parentId: string | null, position: number): Promise<Bookmark>
    reorder(parentId: string | null, orderedIds: string[]): Promise<Bookmark[]>
    search(query: string): Promise<Bookmark[]>
    export(format?: 'html' | 'json'): Promise<IpcRequests['bookmarks:export']['response']>
    import(content: string, fileName: string): Promise<IpcRequests['bookmarks:import']['response']>
  }
  history: {
    query(query?: IpcRequests['history:query']['request']): Promise<HistoryEntry[]>
    remove(ids: string[]): Promise<IpcRequests['history:remove']['response']>
    clear(
      range?: 'all' | 'hour' | 'day' | 'week' | 'month'
    ): Promise<IpcRequests['history:clear']['response']>
    export(): Promise<IpcRequests['history:export']['response']>
  }
  workspaces: {
    list(): Promise<Workspace[]>
    create(input: {
      name: string
      icon?: string
      color?: string
      layout?: 'single' | 'split-vertical' | 'split-horizontal'
    }): Promise<Workspace>
    update(
      id: string,
      patch: {
        name?: string
        icon?: string
        color?: string
        layout?: 'single' | 'split-vertical' | 'split-horizontal'
      }
    ): Promise<Workspace>
    remove(id: string): Promise<IpcRequests['workspaces:delete']['response']>
    reorder(ids: string[]): Promise<Workspace[]>
    setDefault(id: string): Promise<Workspace>
    activate(id: string): Promise<IpcRequests['workspaces:activate']['response']>
    saveSession(name: string, workspaceId?: string): Promise<SavedSession>
    listSessions(): Promise<SavedSession[]>
    renameSession(id: string, name: string): Promise<SavedSession>
    deleteSession(id: string): Promise<IpcRequests['workspaces:deleteSession']['response']>
    restoreSession(id: string): Promise<TabState[]>
  }
  downloads: {
    list(): Promise<DownloadRecord[]>
    cancel(id: string): Promise<DownloadRecord | null>
    open(id: string): Promise<IpcRequests['downloads:open']['response']>
    reveal(id: string): Promise<IpcRequests['downloads:reveal']['response']>
    clear(id?: string): Promise<IpcRequests['downloads:clear']['response']>
    chooseDirectory(): Promise<IpcRequests['downloads:chooseDirectory']['response']>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
    clearBrowsingData(
      scope: 'history' | 'downloads' | 'cache' | 'cookies' | 'all'
    ): Promise<IpcRequests['settings:clearBrowsingData']['response']>
    exportData(): Promise<IpcRequests['settings:exportData']['response']>
  }
  permissions: {
    list(): Promise<PermissionDecisionRecord[]>
    set(
      origin: string,
      permission: string,
      decision: 'allow' | 'deny' | 'ask'
    ): Promise<PermissionDecisionRecord>
    reset(): Promise<IpcRequests['permissions:reset']['response']>
    respond(
      requestId: string,
      allow: boolean,
      remember?: boolean
    ): Promise<IpcRequests['permissions:respond']['response']>
  }
  ai: {
    getProviderConfig(): Promise<AiProviderConfig>
    saveProviderConfig(
      config: Partial<AiProviderConfig>,
      apiKey?: string | null
    ): Promise<AiProviderConfig>
    testProvider(): Promise<IpcRequests['ai:testProvider']['response']>
    listConversations(): Promise<AiConversation[]>
    createConversation(title?: string): Promise<AiConversation>
    renameConversation(id: string, title: string): Promise<AiConversation>
    deleteConversation(id: string): Promise<IpcRequests['ai:deleteConversation']['response']>
    clearConversation(id: string): Promise<IpcRequests['ai:clearConversation']['response']>
    listMessages(conversationId: string): Promise<AiMessage[]>
    send(request: IpcRequests['ai:send']['request']): Promise<AiCompletionResult>
    stop(conversationId: string): Promise<IpcRequests['ai:stop']['response']>
    extractContext(
      tabIds: string[],
      options?: { includeSelection?: boolean; includeReadable?: boolean }
    ): Promise<AiContextBundle>
    getSelection(tabId: string): Promise<IpcRequests['ai:getSelection']['response']>
  }
  dev: {
    listFolders(): Promise<SnippetFolder[]>
    createFolder(name: string): Promise<SnippetFolder>
    deleteFolder(id: string): Promise<IpcRequests['dev:deleteFolder']['response']>
    listSnippets(search?: string, folderId?: string | null): Promise<Snippet[]>
    saveSnippet(request: IpcRequests['dev:saveSnippet']['request']): Promise<Snippet>
    deleteSnippet(id: string): Promise<IpcRequests['dev:deleteSnippet']['response']>
    listCollections(): Promise<ApiCollection[]>
    createCollection(name: string, description?: string): Promise<ApiCollection>
    updateCollection(
      id: string,
      patch: { name?: string; description?: string }
    ): Promise<ApiCollection>
    deleteCollection(id: string): Promise<IpcRequests['dev:deleteCollection']['response']>
    listRequests(collectionId?: string | null): Promise<ApiRequestRecord[]>
    saveRequest(request: IpcRequests['dev:saveRequest']['request']): Promise<ApiRequestRecord>
    deleteRequest(id: string): Promise<IpcRequests['dev:deleteRequest']['response']>
    sendRequest(payload: HttpRequestPayload): Promise<{
      response: HttpResponsePayload | null
      error: string | null
      requestId: string
    }>
    cancelRequest(requestId: string): Promise<IpcRequests['dev:cancelRequest']['response']>
    httpHistory(): Promise<HttpRequestHistoryEntry[]>
    clearHttpHistory(): Promise<IpcRequests['dev:clearHttpHistory']['response']>
    exportCollections(): Promise<IpcRequests['dev:exportCollections']['response']>
    importCollections(
      content: string,
      fileName: string
    ): Promise<IpcRequests['dev:importCollections']['response']>
  }
  /** Subscribes to a main-process event. Returns an unsubscribe function. */
  on<E extends keyof IpcEvents>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
  /** Removes every listener registered through `on`. */
  removeAllListeners(): void
}
