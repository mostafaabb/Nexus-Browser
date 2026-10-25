/** Core browser domain types. */

import type { WorkspaceId } from './workspaces'

export type TabId = string
export type TabGroupId = string

export type TabStatus = 'idle' | 'loading' | 'error' | 'crashed'

export type SecurityStatus = 'secure' | 'insecure' | 'internal' | 'unknown'

export interface TabState {
  id: TabId
  workspaceId: WorkspaceId
  groupId: TabGroupId | null
  title: string
  url: string
  faviconUrl: string | null
  status: TabStatus
  loading: boolean
  progress: number
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  pinned: boolean
  muted: boolean
  audible: boolean
  crashed: boolean
  /** True for the tab that is currently shown in this window. */
  isActive: boolean
  /** Error message produced by the last failed navigation (application owned). */
  error: string | null
  errorCode: string | null
  openerTabId: TabId | null
  createdAt: number
  lastActiveAt: number
  /** Set when the tab was created from a persisted session (not yet restored). */
  pendingUrl: string | null
  /** True when the tab lives in a private window. */
  private: boolean
}

export interface TabGroup {
  id: TabGroupId
  workspaceId: WorkspaceId
  name: string
  color: string
  collapsed: boolean
  position: number
}

export type SplitOrientation = 'vertical' | 'horizontal'

export interface SplitLayout {
  enabled: boolean
  orientation: SplitOrientation
  /** Percentage (0.2 - 0.8) of the viewport given to the first pane. */
  ratio: number
  leftTabId: TabId | null
  rightTabId: TabId | null
}

export interface ViewLayoutEntry {
  tabId: TabId
  x: number
  y: number
  width: number
  height: number
}

export interface NavigationEvent {
  tabId: TabId
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isMainFrame: boolean
}
