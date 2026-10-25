/**
 * Nexus Browser — preload script.
 *
 * The preload script is the only bridge between the privileged main process
 * and the sandboxed renderer. It runs with `contextIsolation: true` and
 * `sandbox: true`, exposes a narrow, fully typed API through the context
 * bridge and never leaks `ipcRenderer` or any Node.js primitive.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENTS, type IpcEventName } from '@shared/contracts/channels'
import type { IpcEvents, IpcRequests } from '@shared/contracts/ipc'
import { ERROR_CODES, type ErrorCode } from '@shared/errors'
import { NexusApiError, type NexusApi } from '@shared/contracts/api'

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string; details?: unknown }
}

/**
 * Invokes a privileged channel and unwraps the `{ ok, data | error }`
 * envelope. Failures are surfaced as {@link NexusApiError} so that the
 * renderer can show a meaningful message.
 */
async function invoke<K extends keyof IpcRequests>(
  channel: K,
  payload?: IpcRequests[K]['request']
): Promise<IpcRequests[K]['response']> {
  const response = (await ipcRenderer.invoke(channel, payload)) as Envelope<
    IpcRequests[K]['response']
  > | null

  if (!response || typeof response !== 'object') {
    throw new NexusApiError(ERROR_CODES.UNKNOWN, 'The main process did not return a result.')
  }
  if (response.ok) {
    return response.data as IpcRequests[K]['response']
  }
  const raw = response.error?.code
  const code: ErrorCode =
    typeof raw === 'string' && raw in ERROR_CODES ? (raw as ErrorCode) : ERROR_CODES.UNKNOWN
  throw new NexusApiError(
    code,
    response.error?.message ?? 'The operation could not be completed.',
    response.error?.details
  )
}

const call = <K extends keyof IpcRequests>(
  channel: K,
  payload?: IpcRequests[K]['request']
): Promise<IpcRequests[K]['response']> => invoke(channel, payload)

const api: NexusApi = {
  app: {
    getInfo: () => call('app:getInfo'),
    openExternal: (url) => call('app:openExternal', { url }),
    revealPath: (path) => call('app:revealPath', { path }),
    openPath: (path) => call('app:openPath', { path }),
    createPrivateWindow: () => call('app:createPrivateWindow'),
    quit: () => call('app:quit'),
    saveTextFile: (content, fileName, filters) =>
      call('app:saveTextFile', { content, fileName, filters }),
    openTextFile: (filters) => call('app:openTextFile', { filters })
  },
  window: {
    minimize: () => call('window:minimize'),
    toggleMaximize: () => call('window:toggleMaximize'),
    close: () => call('window:close'),
    isMaximized: () => call('window:isMaximized'),
    setTitle: (title) => call('window:setTitle', { title }),
    setTheme: (theme) => call('window:setTheme', { theme })
  },
  tabs: {
    list: () => call('tabs:list'),
    create: (options) => call('tabs:create', options ?? {}),
    close: (tabId) => call('tabs:close', { tabId }),
    activate: (tabId) => call('tabs:activate', { tabId }),
    move: (tabId, toIndex) => call('tabs:move', { tabId, toIndex }),
    moveToWorkspace: (tabId, workspaceId) => call('tabs:moveToWorkspace', { tabId, workspaceId }),
    setPinned: (tabId, pinned) => call('tabs:setPinned', { tabId, pinned }),
    setMuted: (tabId, muted) => call('tabs:setMuted', { tabId, muted }),
    duplicate: (tabId) => call('tabs:duplicate', { tabId }),
    reorder: (tabIds) => call('tabs:reorder', { tabIds }),
    groups: (workspaceId) => call('tabs:groups', { workspaceId }),
    createGroup: (workspaceId, name, color) =>
      call('tabs:createGroup', { workspaceId, name, color }),
    updateGroup: (groupId, patch) => call('tabs:updateGroup', { groupId, ...patch }),
    deleteGroup: (groupId) => call('tabs:deleteGroup', { groupId }),
    assignToGroup: (tabId, groupId) => call('tabs:assignToGroup', { tabId, groupId })
  },
  nav: {
    navigate: (tabId, url) => call('nav:navigate', { tabId, url }),
    goBack: (tabId) => call('nav:goBack', { tabId }),
    goForward: (tabId) => call('nav:goForward', { tabId }),
    reload: (tabId, hard) => call('nav:reload', { tabId, hard }),
    stop: (tabId) => call('nav:stop', { tabId }),
    home: (tabId) => call('nav:home', { tabId }),
    openInNewTab: (url, workspaceId) => call('nav:openInNewTab', { url, workspaceId }),
    findInPage: (tabId, query, forward = true, findNext = false) =>
      call('nav:findInPage', { tabId, query, forward, findNext }),
    stopFindInPage: (tabId) => call('nav:stopFindInPage', { tabId }),
    print: (tabId) => call('nav:print', { tabId }),
    extractReaderContent: (tabId) => call('nav:extractReaderContent', { tabId }),
    zoomIn: (tabId) => call('nav:zoomIn', { tabId }),
    zoomOut: (tabId) => call('nav:zoomOut', { tabId }),
    resetZoom: (tabId) => call('nav:resetZoom', { tabId }),
    setZoom: (tabId, factor) => call('nav:setZoom', { tabId, factor }),
    togglePictureInPicture: (tabId) => call('nav:togglePictureInPicture', { tabId })
  },
  layout: {
    setViews: (entries) => call('layout:setViews', { entries })
  },
  bookmarks: {
    list: () => call('bookmarks:list'),
    create: (title, url, parentId) => call('bookmarks:create', { title, url, parentId }),
    createFolder: (title, parentId) => call('bookmarks:createFolder', { title, parentId }),
    update: (id, patch) => call('bookmarks:update', { id, ...patch }),
    remove: (id) => call('bookmarks:delete', { id }),
    move: (id, parentId, position) => call('bookmarks:move', { id, parentId, position }),
    reorder: (parentId, orderedIds) => call('bookmarks:reorder', { parentId, orderedIds }),
    search: (query) => call('bookmarks:search', { query }),
    export: (format) => call('bookmarks:export', { format }),
    import: (content, fileName) => call('bookmarks:import', { content, fileName })
  },
  history: {
    query: (query) => call('history:query', query ?? {}),
    remove: (ids) => call('history:remove', { ids }),
    clear: (range) => call('history:clear', { range }),
    export: () => call('history:export')
  },
  workspaces: {
    list: () => call('workspaces:list'),
    create: (input) => call('workspaces:create', input),
    update: (id, patch) => call('workspaces:update', { id, ...patch }),
    remove: (id) => call('workspaces:delete', { id }),
    reorder: (ids) => call('workspaces:reorder', { ids }),
    setDefault: (id) => call('workspaces:setDefault', { id }),
    activate: (id) => call('workspaces:activate', { id }),
    saveSession: (name, workspaceId) => call('workspaces:saveSession', { name, workspaceId }),
    listSessions: () => call('workspaces:listSessions'),
    renameSession: (id, name) => call('workspaces:renameSession', { id, name }),
    deleteSession: (id) => call('workspaces:deleteSession', { id }),
    restoreSession: (id) => call('workspaces:restoreSession', { id })
  },
  downloads: {
    list: () => call('downloads:list'),
    cancel: (id) => call('downloads:cancel', { id }),
    open: (id) => call('downloads:open', { id }),
    reveal: (id) => call('downloads:reveal', { id }),
    clear: (id) => call('downloads:clear', { id }),
    chooseDirectory: () => call('downloads:chooseDirectory')
  },
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', { patch }),
    reset: () => call('settings:reset'),
    clearBrowsingData: (scope) => call('settings:clearBrowsingData', { scope }),
    exportData: () => call('settings:exportData')
  },
  permissions: {
    list: () => call('permissions:list'),
    set: (origin, permission, decision) =>
      call('permissions:set', { origin, permission, decision }),
    reset: () => call('permissions:reset'),
    respond: (requestId, allow, remember) =>
      call('permissions:respond', { requestId, allow, remember })
  },
  ai: {
    getProviderConfig: () => call('ai:getProviderConfig'),
    saveProviderConfig: (config, apiKey) => call('ai:saveProviderConfig', { config, apiKey }),
    testProvider: () => call('ai:testProvider'),
    listConversations: () => call('ai:listConversations'),
    createConversation: (title) => call('ai:createConversation', { title }),
    renameConversation: (id, title) => call('ai:renameConversation', { id, title }),
    deleteConversation: (id) => call('ai:deleteConversation', { id }),
    clearConversation: (id) => call('ai:clearConversation', { id }),
    listMessages: (conversationId) => call('ai:listMessages', { conversationId }),
    send: (request) => call('ai:send', request),
    stop: (conversationId) => call('ai:stop', { conversationId }),
    extractContext: (tabIds, options) => call('ai:extractContext', { tabIds, ...(options ?? {}) }),
    getSelection: (tabId) => call('ai:getSelection', { tabId })
  },
  dev: {
    listFolders: () => call('dev:listFolders'),
    createFolder: (name) => call('dev:createFolder', { name }),
    deleteFolder: (id) => call('dev:deleteFolder', { id }),
    listSnippets: (search, folderId) => call('dev:listSnippets', { search, folderId }),
    saveSnippet: (request) => call('dev:saveSnippet', request),
    deleteSnippet: (id) => call('dev:deleteSnippet', { id }),
    listCollections: () => call('dev:listCollections'),
    createCollection: (name, description) => call('dev:createCollection', { name, description }),
    updateCollection: (id, patch) => call('dev:updateCollection', { id, ...patch }),
    deleteCollection: (id) => call('dev:deleteCollection', { id }),
    listRequests: (collectionId) => call('dev:listRequests', { collectionId }),
    saveRequest: (request) => call('dev:saveRequest', request),
    deleteRequest: (id) => call('dev:deleteRequest', { id }),
    sendRequest: (payload) => call('dev:sendRequest', payload),
    cancelRequest: (requestId) => call('dev:cancelRequest', { requestId }),
    httpHistory: () => call('dev:httpHistory'),
    clearHttpHistory: () => call('dev:clearHttpHistory'),
    exportCollections: () => call('dev:exportCollections'),
    importCollections: (content, fileName) => call('dev:importCollections', { content, fileName })
  },
  on: <E extends IpcEventName>(event: E, listener: (payload: IpcEvents[E]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: IpcEvents[E]): void => {
      listener(payload)
    }
    ipcRenderer.on(event, handler)
    return () => {
      ipcRenderer.removeListener(event, handler)
    }
  },
  removeAllListeners: () => {
    for (const event of Object.values(IPC_EVENTS)) {
      ipcRenderer.removeAllListeners(event)
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nexus', api)
} else {
  // `contextIsolation` is always enabled by Nexus. This branch only exists so
  // that a misconfiguration fails loudly instead of silently.
  ;(globalThis as unknown as { nexus: NexusApi }).nexus = api
}
