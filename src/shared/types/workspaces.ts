/** Workspace and session types. */

export type WorkspaceId = string

export type WorkspaceLayout = 'single' | 'split-vertical' | 'split-horizontal'

export interface Workspace {
  id: WorkspaceId
  name: string
  /** Lucide icon name. */
  icon: string
  /** Hex colour used for the workspace accent. */
  color: string
  position: number
  createdAt: number
  updatedAt: number
  isDefault: boolean
  layout: WorkspaceLayout
}

export interface WorkspaceTabRecord {
  workspaceId: WorkspaceId
  tabId: string
  position: number
  groupId: string | null
  pinned: boolean
  /** Last known URL of the tab — used to restore sessions after a restart. */
  url: string
  /** Last known title of the tab. */
  title: string
}

export interface SavedSession {
  id: string
  name: string
  workspaceId: WorkspaceId | null
  createdAt: number
  updatedAt: number
}

export interface SavedSessionTab {
  sessionId: string
  tabId: string
  url: string
  title: string
  position: number
  groupId: string | null
}

export interface RecentlyClosedTab {
  id: string
  url: string
  title: string
  workspaceId: WorkspaceId | null
  groupId: string | null
  closedAt: number
}
