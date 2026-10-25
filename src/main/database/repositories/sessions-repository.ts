import type { RecentlyClosedTab, SavedSession, SavedSessionTab } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface SessionRow {
  id: string
  name: string
  workspace_id: string | null
  created_at: number
  updated_at: number
}

interface SessionTabRow {
  session_id: string
  tab_id: string
  url: string
  title: string
  position: number
  group_id: string | null
}

interface RecentRow {
  id: string
  url: string
  title: string
  workspace_id: string | null
  group_id: string | null
  closed_at: number
}

export class SessionsRepository {
  constructor(private readonly db: NexusDatabase) {}

  listSessions(): SavedSession[] {
    return this.db
      .all<SessionRow>('SELECT * FROM saved_sessions ORDER BY updated_at DESC')
      .map((row) => ({
        id: row.id,
        name: row.name,
        workspaceId: row.workspace_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
  }

  getSession(id: string): SavedSession | null {
    const row = this.db.get<SessionRow>('SELECT * FROM saved_sessions WHERE id = ?', [id])
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      workspaceId: row.workspace_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  createSession(name: string, workspaceId: string | null): SavedSession {
    const now = Date.now()
    const id = createId('ses')
    this.db.run(
      'INSERT INTO saved_sessions (id, name, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, workspaceId, now, now]
    )
    return this.getSession(id)!
  }

  renameSession(id: string, name: string): SavedSession | null {
    const existing = this.getSession(id)
    if (!existing) return null
    this.db.run('UPDATE saved_sessions SET name = ?, updated_at = ? WHERE id = ?', [
      name,
      Date.now(),
      id
    ])
    return this.getSession(id)
  }

  deleteSession(id: string): boolean {
    return this.db.run('DELETE FROM saved_sessions WHERE id = ?', [id]).changes > 0
  }

  addSessionTab(tab: SavedSessionTab): void {
    this.db.run(
      'INSERT INTO saved_session_tabs (session_id, tab_id, url, title, position, group_id) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(session_id, tab_id) DO UPDATE SET url = excluded.url, title = excluded.title, position = excluded.position',
      [tab.sessionId, tab.tabId, tab.url, tab.title, tab.position, tab.groupId]
    )
  }

  listSessionTabs(sessionId: string): SavedSessionTab[] {
    return this.db
      .all<SessionTabRow>(
        'SELECT * FROM saved_session_tabs WHERE session_id = ? ORDER BY position',
        [sessionId]
      )
      .map((row) => ({
        sessionId: row.session_id,
        tabId: row.tab_id,
        url: row.url,
        title: row.title,
        position: row.position,
        groupId: row.group_id
      }))
  }

  // ------------------------------------------------- recently closed ---

  addRecentlyClosed(entry: {
    url: string
    title: string
    workspaceId: string | null
    groupId: string | null
  }): void {
    const id = createId('rc')
    this.db.run(
      'INSERT INTO recently_closed (id, url, title, workspace_id, group_id, closed_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, entry.url, entry.title, entry.workspaceId, entry.groupId, Date.now()]
    )
    this.db.run(
      'DELETE FROM recently_closed WHERE id NOT IN (SELECT id FROM recently_closed ORDER BY closed_at DESC LIMIT 50)'
    )
  }

  listRecentlyClosed(limit = 20): RecentlyClosedTab[] {
    return this.db
      .all<RecentRow>('SELECT * FROM recently_closed ORDER BY closed_at DESC LIMIT ?', [limit])
      .map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        workspaceId: row.workspace_id,
        groupId: row.group_id,
        closedAt: row.closed_at
      }))
  }

  popRecentlyClosed(): RecentlyClosedTab | null {
    const entry = this.listRecentlyClosed(1)[0]
    if (!entry) return null
    this.db.run('DELETE FROM recently_closed WHERE id = ?', [entry.id])
    return entry
  }

  clearRecentlyClosed(): number {
    return this.db.run('DELETE FROM recently_closed').changes
  }
}
