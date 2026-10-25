/**
 * Typed IPC contracts.
 *
 * Every privileged operation exposed to the renderer is declared here with an
 * explicit request and response type. The preload script is the only place
 * where these channels are bound to functions, and every payload is validated
 * on the main-process side before it is used.
 */

import type {
  AiCompletionResult,
  AiContextBundle,
  AiContextItem,
  AiConversation,
  AiMessage,
  AiProviderConfig,
  ApiCollection,
  ApiRequestRecord,
  AppSettings,
  Bookmark,
  DownloadRecord,
  HistoryEntry,
  HistoryQuery,
  HttpRequestHistoryEntry,
  HttpRequestPayload,
  HttpResponsePayload,
  PermissionDecisionRecord,
  SavedSession,
  Snippet,
  SnippetFolder,
  TabGroup,
  TabState,
  ViewLayoutEntry,
  Workspace
} from '../types'

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: string
  isPackaged: boolean
  userDataPath: string
  /** The workspace this window is currently showing. */
  workspaceId: string
  /** True when the window belongs to a private browsing session. */
  isPrivate: boolean
}

export interface AiSendRequest {
  conversationId: string | null
  prompt: string
  actionId: string | null
  context: AiContextItem[]
  providerId?: string
}

export interface AiProviderTestResult {
  ok: boolean
  message: string
  latencyMs: number
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface ExportResult {
  fileName: string
  content: string
}

export interface FindInPageRequest {
  query: string
  forward: boolean
  findNext: boolean
}

export interface FindInPageResult {
  /** Identifier of the Chromium find request. */
  requestId: number
  activeMatchOrdinal: number
  matches: number
  /** Screen rectangle of the first match, when Electron reported one. */
  selectionArea: { x: number; y: number; width: number; height: number } | null
  finalUpdate: boolean
}

export interface ReaderContent {
  available: boolean
  title: string | null
  byline: string | null
  text: string
  wordCount: number
  reason: string | null
}

/** Request/response pairs for every `ipcMain.handle` channel. */
export interface IpcRequests {
  // ---------------------------------------------------------------- app ---
  'app:getInfo': { request: void; response: AppInfo }
  'app:openExternal': { request: { url: string }; response: { opened: boolean } }
  'app:revealPath': { request: { path: string }; response: { revealed: boolean } }
  'app:openPath': { request: { path: string }; response: { opened: boolean } }
  'app:createPrivateWindow': { request: void; response: { windowId: number } }
  'app:quit': { request: void; response: { quitting: boolean } }
  'app:saveTextFile': {
    request: {
      content: string
      fileName: string
      filters?: Array<{ name: string; extensions: string[] }>
    }
    response: { saved: boolean; path: string | null }
  }
  'app:openTextFile': {
    request: { filters?: Array<{ name: string; extensions: string[] }> }
    response: { content: string; fileName: string } | null
  }

  // ------------------------------------------------------------- window ---
  'window:minimize': { request: void; response: void }
  'window:toggleMaximize': { request: void; response: { maximized: boolean } }
  'window:close': { request: void; response: void }
  'window:isMaximized': { request: void; response: { maximized: boolean } }
  'window:setTitle': { request: { title: string }; response: { title: string } }
  'window:setTheme': { request: { theme: 'dark' | 'light' }; response: { theme: 'dark' | 'light' } }

  // --------------------------------------------------------------- tabs ---
  'tabs:list': { request: void; response: TabState[] }
  'tabs:create': {
    request: { url?: string; workspaceId?: string; activate?: boolean; background?: boolean }
    response: TabState
  }
  'tabs:close': { request: { tabId: string }; response: { closed: boolean } }
  'tabs:activate': { request: { tabId: string }; response: TabState }
  'tabs:move': { request: { tabId: string; toIndex: number }; response: TabState[] }
  'tabs:moveToWorkspace': {
    request: { tabId: string; workspaceId: string }
    response: TabState[]
  }
  'tabs:setPinned': { request: { tabId: string; pinned: boolean }; response: TabState }
  'tabs:setMuted': { request: { tabId: string; muted: boolean }; response: TabState }
  'tabs:duplicate': { request: { tabId: string }; response: TabState }
  'tabs:reorder': { request: { tabIds: string[] }; response: TabState[] }
  'tabs:groups': { request: { workspaceId: string }; response: TabGroup[] }
  'tabs:createGroup': {
    request: { workspaceId: string; name: string; color: string; tabIds?: string[] }
    response: TabGroup
  }
  'tabs:updateGroup': {
    request: { groupId: string; name?: string; color?: string; collapsed?: boolean }
    response: TabGroup
  }
  'tabs:deleteGroup': { request: { groupId: string }; response: { deleted: boolean } }
  'tabs:assignToGroup': {
    request: { tabId: string; groupId: string | null }
    response: TabState
  }

  // --------------------------------------------------------- navigation ---
  'nav:navigate': { request: { tabId: string; url: string }; response: { url: string } }
  'nav:goBack': { request: { tabId: string }; response: TabState }
  'nav:goForward': { request: { tabId: string }; response: TabState }
  'nav:reload': { request: { tabId: string; hard?: boolean }; response: TabState }
  'nav:stop': { request: { tabId: string }; response: TabState }
  'nav:home': { request: { tabId: string }; response: { url: string } }
  'nav:openInNewTab': { request: { url: string; workspaceId?: string }; response: TabState }
  'nav:findInPage': { request: FindInPageRequest & { tabId: string }; response: FindInPageResult }
  'nav:stopFindInPage': { request: { tabId: string }; response: { stopped: boolean } }
  'nav:print': { request: { tabId: string }; response: { started: boolean } }
  'nav:extractReaderContent': { request: { tabId: string }; response: ReaderContent }
  'nav:zoomIn': { request: { tabId: string }; response: TabState }
  'nav:zoomOut': { request: { tabId: string }; response: TabState }
  'nav:resetZoom': { request: { tabId: string }; response: TabState }
  'nav:setZoom': { request: { tabId: string; factor: number }; response: TabState }
  'nav:togglePictureInPicture': { request: { tabId: string }; response: { active: boolean } }

  // ------------------------------------------------------------- layout ---
  'layout:setViews': { request: { entries: ViewLayoutEntry[] }; response: void }

  // ---------------------------------------------------------- bookmarks ---
  'bookmarks:list': { request: void; response: Bookmark[] }
  'bookmarks:create': {
    request: { title: string; url: string; parentId?: string | null }
    response: Bookmark
  }
  'bookmarks:createFolder': {
    request: { title: string; parentId?: string | null }
    response: Bookmark
  }
  'bookmarks:update': {
    request: { id: string; title?: string; url?: string }
    response: Bookmark
  }
  'bookmarks:delete': { request: { id: string }; response: { deleted: boolean } }
  'bookmarks:move': {
    request: { id: string; parentId: string | null; position: number }
    response: Bookmark
  }
  'bookmarks:reorder': {
    request: { parentId: string | null; orderedIds: string[] }
    response: Bookmark[]
  }
  'bookmarks:search': { request: { query: string }; response: Bookmark[] }
  'bookmarks:export': { request: { format?: 'html' | 'json' }; response: ExportResult }
  'bookmarks:import': { request: { content: string; fileName: string }; response: ImportResult }

  // ------------------------------------------------------------ history ---
  'history:query': { request: HistoryQuery; response: HistoryEntry[] }
  'history:remove': { request: { ids: string[] }; response: { removed: number } }
  'history:clear': { request: { range?: string }; response: { removed: number } }
  'history:export': { request: void; response: ExportResult }

  // --------------------------------------------------------- workspaces ---
  'workspaces:list': { request: void; response: Workspace[] }
  'workspaces:create': {
    request: { name: string; icon?: string; color?: string; layout?: string }
    response: Workspace
  }
  'workspaces:update': {
    request: { id: string; name?: string; icon?: string; color?: string; layout?: string }
    response: Workspace
  }
  'workspaces:delete': { request: { id: string }; response: { deleted: boolean } }
  'workspaces:reorder': { request: { ids: string[] }; response: Workspace[] }
  'workspaces:setDefault': { request: { id: string }; response: Workspace }
  'workspaces:activate': { request: { id: string }; response: { workspaceId: string } }
  'workspaces:saveSession': {
    request: { name: string; workspaceId?: string }
    response: SavedSession
  }
  'workspaces:listSessions': { request: void; response: SavedSession[] }
  'workspaces:renameSession': {
    request: { id: string; name: string }
    response: SavedSession
  }
  'workspaces:deleteSession': { request: { id: string }; response: { deleted: boolean } }
  'workspaces:restoreSession': { request: { id: string }; response: TabState[] }

  // ---------------------------------------------------------- downloads ---
  'downloads:list': { request: void; response: DownloadRecord[] }
  'downloads:cancel': { request: { id: string }; response: DownloadRecord | null }
  'downloads:open': { request: { id: string }; response: { opened: boolean } }
  'downloads:reveal': { request: { id: string }; response: { revealed: boolean } }
  'downloads:clear': { request: { id?: string }; response: { cleared: number } }
  'downloads:chooseDirectory': { request: void; response: { directory: string | null } }

  // ----------------------------------------------------------- settings ---
  'settings:get': { request: void; response: AppSettings }
  'settings:set': {
    request: { patch: Partial<AppSettings> }
    response: AppSettings
  }
  'settings:reset': { request: void; response: AppSettings }
  'settings:clearBrowsingData': {
    request: { scope: 'history' | 'downloads' | 'cache' | 'cookies' | 'all' }
    response: { cleared: string[] }
  }
  'settings:exportData': { request: void; response: ExportResult }

  // -------------------------------------------------------- permissions ---
  'permissions:list': { request: void; response: PermissionDecisionRecord[] }
  'permissions:set': {
    request: { origin: string; permission: string; decision: 'allow' | 'deny' | 'ask' }
    response: PermissionDecisionRecord
  }
  'permissions:reset': { request: void; response: { cleared: number } }
  'permissions:respond': {
    request: { requestId: string; allow: boolean; remember?: boolean }
    response: { resolved: boolean }
  }

  // ----------------------------------------------------------------- ai ---
  'ai:getProviderConfig': { request: void; response: AiProviderConfig }
  'ai:saveProviderConfig': {
    request: { config: Partial<AiProviderConfig>; apiKey?: string | null }
    response: AiProviderConfig
  }
  'ai:testProvider': { request: void; response: AiProviderTestResult }
  'ai:listConversations': { request: void; response: AiConversation[] }
  'ai:createConversation': {
    request: { title?: string }
    response: AiConversation
  }
  'ai:renameConversation': {
    request: { id: string; title: string }
    response: AiConversation
  }
  'ai:deleteConversation': { request: { id: string }; response: { deleted: boolean } }
  'ai:clearConversation': { request: { id: string }; response: { deleted: number } }
  'ai:listMessages': { request: { conversationId: string }; response: AiMessage[] }
  'ai:send': { request: AiSendRequest; response: AiCompletionResult }
  'ai:stop': { request: { conversationId: string }; response: { stopped: boolean } }
  'ai:extractContext': {
    request: { tabIds: string[]; includeSelection?: boolean; includeReadable?: boolean }
    response: AiContextBundle
  }
  'ai:getSelection': { request: { tabId: string }; response: { text: string } }

  // ------------------------------------------------------ developer kit ---
  'dev:listFolders': { request: void; response: SnippetFolder[] }
  'dev:createFolder': { request: { name: string }; response: SnippetFolder }
  'dev:deleteFolder': { request: { id: string }; response: { deleted: boolean } }
  'dev:listSnippets': {
    request: { search?: string; folderId?: string | null; tag?: string }
    response: Snippet[]
  }
  'dev:saveSnippet': {
    request: {
      id?: string
      title: string
      description?: string
      code: string
      language: string
      folderId?: string | null
      tags?: string[]
      favorite?: boolean
    }
    response: Snippet
  }
  'dev:deleteSnippet': { request: { id: string }; response: { deleted: boolean } }
  'dev:listCollections': { request: void; response: ApiCollection[] }
  'dev:createCollection': {
    request: { name: string; description?: string }
    response: ApiCollection
  }
  'dev:updateCollection': {
    request: { id: string; name?: string; description?: string }
    response: ApiCollection
  }
  'dev:deleteCollection': { request: { id: string }; response: { deleted: boolean } }
  'dev:listRequests': { request: { collectionId?: string | null }; response: ApiRequestRecord[] }
  'dev:saveRequest': {
    request: { id?: string; record: Omit<ApiRequestRecord, 'id' | 'createdAt' | 'updatedAt'> }
    response: ApiRequestRecord
  }
  'dev:deleteRequest': { request: { id: string }; response: { deleted: boolean } }
  'dev:sendRequest': {
    request: HttpRequestPayload
    response: { response: HttpResponsePayload | null; error: string | null; requestId: string }
  }
  'dev:cancelRequest': { request: { requestId: string }; response: { cancelled: boolean } }
  'dev:httpHistory': { request: void; response: HttpRequestHistoryEntry[] }
  'dev:clearHttpHistory': { request: void; response: { cleared: number } }
  'dev:exportCollections': { request: void; response: ExportResult }
  'dev:importCollections': {
    request: { content: string; fileName: string }
    response: ImportResult
  }
}

/** Events pushed from the main process to the renderer. */
export interface IpcEvents {
  'tab:updated': TabState
  'tab:removed': { tabId: string }
  'tab:activated': { tabId: string }
  'tab:list-changed': TabState[]
  'nav:updated': {
    tabId: string
    url: string
    title: string
    loading: boolean
    canGoBack: boolean
    canGoForward: boolean
    faviconUrl: string | null
    status: string
  }
  'download:updated': DownloadRecord
  'download:removed': { id: string }
  'workspace:changed': Workspace[]
  'workspace:activated': { workspaceId: string }
  'ai:chunk': {
    conversationId: string
    messageId: string
    delta: string
  }
  'ai:done': {
    conversationId: string
    messageId: string
    usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null
  }
  'ai:error': { conversationId: string; messageId: string; message: string }
  'ai:cancelled': { conversationId: string; messageId: string }
  'permission:requested': {
    requestId: string
    origin: string
    permission: string
    mediaTypes: string[]
  }
  'window:state': { maximized: boolean; focused: boolean }
  'app:before-quit': void
}
