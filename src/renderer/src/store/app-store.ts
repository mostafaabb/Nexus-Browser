import { create } from 'zustand'
import type { AppSettings, DownloadRecord, SplitLayout, TabState, Workspace } from '@shared/types'
import type { AppInfo } from '@shared/contracts/ipc'
import { errorMessage, nexus } from '../lib/api'

/** Content shown in the left sidebar. */
export type PanelId = 'bookmarks' | 'history' | 'downloads' | 'snippets' | null

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
}

interface AppState {
  ready: boolean
  fatalError: string | null
  info: AppInfo | null
  settings: AppSettings | null
  workspaces: Workspace[]
  activeWorkspaceId: string
  tabs: TabState[]
  activeTabId: string | null
  downloads: DownloadRecord[]
  panel: PanelId
  aiOpen: boolean
  devOpen: boolean
  findOpen: boolean
  split: SplitLayout
  toasts: Toast[]

  initialize: () => Promise<void>
  setTabs: (tabs: TabState[]) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setDownloads: (downloads: DownloadRecord[]) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  createTab: (url?: string) => Promise<void>
  closeTab: (tabId: string) => Promise<void>
  activateTab: (tabId: string) => Promise<void>
  navigate: (url: string, tabId?: string) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  reload: (hard?: boolean) => Promise<void>
  togglePanel: (panel: PanelId) => void
  toggleAi: () => void
  toggleDev: () => void
  toggleFind: () => void
  activateWorkspace: (workspaceId: string) => Promise<void>
  setSplit: (patch: Partial<SplitLayout>) => void
  toggleSplit: () => Promise<void>
  pushToast: (message: string, tone?: ToastTone) => string
  dismissToast: (id: string) => void
}

let toastCounter = 0
let unsubscribers: Array<() => void> = []
/** Guards against double initialisation (React strict mode mounts twice). */
let initializationStarted = false

/**
 * The toast that announces a download, keyed by download id, so that progress
 * updates replace it instead of stacking a new banner on every event.
 */
const downloadToasts = new Map<string, string>()

/**
 * Announces new, finished and failed downloads.
 *
 * Chrome shows a download bubble; the shell shows the same information as a
 * toast. The `showDownloadNotifications` setting switches this off.
 */
function notifyDownloadUpdate(
  get: () => AppState,
  record: DownloadRecord,
  previous: DownloadRecord | null
): void {
  const state = get()
  if (!state.settings?.showDownloadNotifications) return

  // Only transitions are announced: progress events arrive many times.
  const changed =
    previous === null ? record.status === 'progressing' : previous.status !== record.status
  if (!changed) return

  const existing = downloadToasts.get(record.id)
  if (existing) state.dismissToast(existing)
  downloadToasts.delete(record.id)

  let message: string
  let tone: ToastTone
  if (record.status === 'progressing') {
    message = `Downloading ${record.filename}…`
    tone = 'info'
  } else if (record.status === 'completed') {
    message = `Downloaded ${record.filename}`
    tone = 'success'
  } else if (record.status === 'interrupted') {
    message = `Download failed: ${record.filename}`
    tone = 'error'
  } else {
    // Cancelling is an explicit action of the user, who needs no reminder.
    return
  }

  const toastId = state.pushToast(message, tone)
  if (record.status === 'progressing') downloadToasts.set(record.id, toastId)
}

function activeTabOf(tabs: TabState[]): TabState | null {
  return tabs.find((tab) => tab.isActive) ?? null
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  fatalError: null,
  info: null,
  settings: null,
  workspaces: [],
  activeWorkspaceId: '',
  tabs: [],
  activeTabId: null,
  downloads: [],
  panel: null,
  aiOpen: false,
  devOpen: false,
  findOpen: false,
  split: {
    enabled: false,
    orientation: 'vertical',
    ratio: 0.5,
    leftTabId: null,
    rightTabId: null
  },
  toasts: [],

  async initialize() {
    if (initializationStarted) return
    initializationStarted = true
    try {
      const [info, settings, workspaces, tabs, downloads] = await Promise.all([
        nexus.app.getInfo(),
        nexus.settings.get(),
        nexus.workspaces.list(),
        nexus.tabs.list(),
        nexus.downloads.list()
      ])

      const active = activeTabOf(tabs)
      set({
        info,
        settings,
        workspaces,
        tabs,
        downloads,
        activeWorkspaceId: info.workspaceId,
        activeTabId: active?.id ?? null,
        ready: true
      })

      // A previous initialisation may have left subscriptions behind.
      for (const unsubscribe of unsubscribers) unsubscribe()
      unsubscribers = []

      unsubscribers.push(
        nexus.on('tab:list-changed', (nextTabs) => {
          set({ tabs: nextTabs })
          const current = activeTabOf(nextTabs)
          if (current) set({ activeTabId: current.id })
        }),
        nexus.on('tab:updated', (tab) => {
          set((state) => ({
            tabs: state.tabs.map((item) => (item.id === tab.id ? tab : item))
          }))
        }),
        nexus.on('tab:removed', ({ tabId }) => {
          set((state) => ({ tabs: state.tabs.filter((item) => item.id !== tabId) }))
        }),
        nexus.on('tab:activated', ({ tabId }) => {
          set({ activeTabId: tabId })
        }),
        nexus.on('workspace:changed', (nextWorkspaces) => {
          set({ workspaces: nextWorkspaces })
        }),
        nexus.on('workspace:activated', ({ workspaceId }) => {
          set({ activeWorkspaceId: workspaceId })
        }),
        nexus.on('download:updated', (record) => {
          const previous = get().downloads.find((item) => item.id === record.id) ?? null
          set((state) => {
            const index = state.downloads.findIndex((item) => item.id === record.id)
            if (index < 0) return { downloads: [record, ...state.downloads] }
            const downloads = [...state.downloads]
            downloads[index] = record
            return { downloads }
          })
          notifyDownloadUpdate(get, record, previous)
        }),
        nexus.on('download:removed', () => {
          void nexus.downloads.list().then((downloads) => set({ downloads }))
        })
      )
    } catch (error) {
      set({ fatalError: errorMessage(error), ready: true })
    }
  },

  setTabs: (tabs) => set({ tabs }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setDownloads: (downloads) => set({ downloads }),

  async updateSettings(patch) {
    try {
      const settings = await nexus.settings.set(patch)
      set({ settings })
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async createTab(url) {
    try {
      const tab = await nexus.tabs.create({ url })
      // The main process also broadcasts the full tab list, so the tab may
      // already be present. Merging instead of appending avoids duplicates.
      set((state) =>
        state.tabs.some((item) => item.id === tab.id)
          ? { tabs: state.tabs.map((item) => (item.id === tab.id ? tab : item)) }
          : { tabs: [...state.tabs, tab] }
      )
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async closeTab(tabId) {
    try {
      await nexus.tabs.close(tabId)
      set((state) => ({ tabs: state.tabs.filter((tab) => tab.id !== tabId) }))
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async activateTab(tabId) {
    try {
      const tab = await nexus.tabs.activate(tabId)
      set((state) => ({
        tabs: state.tabs.map((item) => ({
          ...item,
          isActive:
            item.id === tab.id ? true : item.workspaceId === tab.workspaceId ? false : item.isActive
        })),
        activeTabId: tab.id
      }))
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async navigate(url, tabId) {
    const target = tabId ?? get().activeTabId
    if (!target) {
      await get().createTab(url)
      return
    }
    try {
      await nexus.nav.navigate(target, url)
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async goBack() {
    const target = get().activeTabId
    if (!target) return
    try {
      await nexus.nav.goBack(target)
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async goForward() {
    const target = get().activeTabId
    if (!target) return
    try {
      await nexus.nav.goForward(target)
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  async reload(hard) {
    const target = get().activeTabId
    if (!target) return
    try {
      await nexus.nav.reload(target, hard)
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  togglePanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
  toggleAi: () => set((state) => ({ aiOpen: !state.aiOpen })),
  toggleDev: () => set((state) => ({ devOpen: !state.devOpen })),
  toggleFind: () => set((state) => ({ findOpen: !state.findOpen })),

  async activateWorkspace(workspaceId) {
    try {
      const result = await nexus.workspaces.activate(workspaceId)
      set({ activeWorkspaceId: result.workspaceId })
    } catch (error) {
      get().pushToast(errorMessage(error), 'error')
    }
  },

  setSplit: (patch) => set((state) => ({ split: { ...state.split, ...patch } })),

  async toggleSplit() {
    const state = get()
    if (state.split.enabled) {
      state.setSplit({ enabled: false, leftTabId: null, rightTabId: null })
      return
    }
    const workspaceTabs = state.tabs.filter(
      (tab) => tab.workspaceId === state.activeWorkspaceId && !tab.pinned
    )
    const active = state.tabs.find((tab) => tab.id === state.activeTabId) ?? workspaceTabs[0]
    const other =
      workspaceTabs.find((tab) => tab.id !== active?.id) ??
      state.tabs.find((tab) => tab.id !== active?.id)
    if (!active || !other) {
      state.pushToast('Open a second tab to use the split view.', 'info')
      return
    }
    state.setSplit({
      enabled: true,
      orientation: 'vertical',
      ratio: 0.5,
      leftTabId: active.id,
      rightTabId: other.id
    })
  },

  pushToast(message, tone = 'info') {
    toastCounter += 1
    const id = `toast-${toastCounter}`
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
    const timeout = window.setTimeout(
      () => {
        get().dismissToast(id)
      },
      tone === 'error' ? 7000 : 3500
    )
    void timeout
    return id
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))

/** Releases every event subscription (used when the window is torn down). */
export function disposeAppStore(): void {
  for (const unsubscribe of unsubscribers) unsubscribe()
  unsubscribers = []
}
