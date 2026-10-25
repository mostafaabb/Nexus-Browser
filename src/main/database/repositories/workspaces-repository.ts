import type { TabGroup, Workspace, WorkspaceTabRecord } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface WorkspaceRow {
  id: string
  name: string
  icon: string
  color: string
  position: number
  created_at: number
  updated_at: number
  is_default: number
  layout: string
}

interface WorkspaceTabRow {
  workspace_id: string
  tab_id: string
  position: number
  group_id: string | null
  pinned: number
  url: string
  title: string
}

interface GroupRow {
  id: string
  workspace_id: string
  name: string
  color: string
  collapsed: number
  position: number
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDefault: row.is_default === 1,
    layout: (row.layout as Workspace['layout']) ?? 'single'
  }
}

export class WorkspacesRepository {
  constructor(private readonly db: NexusDatabase) {}

  list(): Workspace[] {
    return this.db
      .all<WorkspaceRow>('SELECT * FROM workspaces ORDER BY position, created_at')
      .map(toWorkspace)
  }

  get(id: string): Workspace | null {
    const row = this.db.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id])
    return row ? toWorkspace(row) : null
  }

  create(input: {
    name: string
    icon?: string
    color?: string
    layout?: Workspace['layout']
  }): Workspace {
    const now = Date.now()
    const id = createId('ws')
    const position = this.nextPosition()
    this.db.run(
      'INSERT INTO workspaces (id, name, icon, color, position, created_at, updated_at, is_default, layout) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.name,
        input.icon ?? 'globe',
        input.color ?? '#8b5cf6',
        position,
        now,
        now,
        0,
        input.layout ?? 'single'
      ]
    )
    return this.get(id)!
  }

  update(
    id: string,
    patch: { name?: string; icon?: string; color?: string; layout?: Workspace['layout'] }
  ): Workspace | null {
    const existing = this.get(id)
    if (!existing) return null
    this.db.run(
      'UPDATE workspaces SET name = ?, icon = ?, color = ?, layout = ?, updated_at = ? WHERE id = ?',
      [
        patch.name ?? existing.name,
        patch.icon ?? existing.icon,
        patch.color ?? existing.color,
        patch.layout ?? existing.layout,
        Date.now(),
        id
      ]
    )
    return this.get(id)
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM workspaces WHERE id = ?', [id])
    return result.changes > 0
  }

  setDefault(id: string): Workspace | null {
    if (!this.get(id)) return null
    this.db.transaction(() => {
      this.db.run('UPDATE workspaces SET is_default = 0')
      this.db.run('UPDATE workspaces SET is_default = 1, updated_at = ? WHERE id = ?', [
        Date.now(),
        id
      ])
    })
    return this.get(id)
  }

  getDefault(): Workspace | null {
    const row = this.db.get<WorkspaceRow>('SELECT * FROM workspaces WHERE is_default = 1 LIMIT 1')
    return row ? toWorkspace(row) : null
  }

  reorder(ids: string[]): Workspace[] {
    this.db.transaction(() => {
      ids.forEach((id, index) => {
        this.db.run('UPDATE workspaces SET position = ?, updated_at = ? WHERE id = ?', [
          index,
          Date.now(),
          id
        ])
      })
    })
    return this.list()
  }

  // ------------------------------------------------------------- tabs ---

  listTabs(workspaceId: string): WorkspaceTabRecord[] {
    return this.db
      .all<WorkspaceTabRow>(
        'SELECT * FROM workspace_tabs WHERE workspace_id = ? ORDER BY pinned DESC, position',
        [workspaceId]
      )
      .map((row) => ({
        workspaceId: row.workspace_id,
        tabId: row.tab_id,
        position: row.position,
        groupId: row.group_id,
        pinned: row.pinned === 1,
        url: row.url ?? '',
        title: row.title ?? ''
      }))
  }

  addTab(record: {
    workspaceId: string
    tabId: string
    position?: number
    groupId?: string | null
    pinned?: boolean
    url?: string
    title?: string
  }): void {
    const position = record.position ?? this.nextTabPosition(record.workspaceId)
    this.db.run(
      'INSERT INTO workspace_tabs (workspace_id, tab_id, position, group_id, pinned, url, title) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(tab_id) DO UPDATE SET workspace_id = excluded.workspace_id, position = excluded.position, group_id = excluded.group_id, pinned = excluded.pinned, url = excluded.url, title = excluded.title',
      [
        record.workspaceId,
        record.tabId,
        position,
        record.groupId ?? null,
        record.pinned ? 1 : 0,
        record.url ?? '',
        record.title ?? ''
      ]
    )
  }

  updateTab(
    tabId: string,
    patch: {
      position?: number
      groupId?: string | null
      pinned?: boolean
      url?: string
      title?: string
    }
  ): void {
    const existing = this.db.get<WorkspaceTabRow>('SELECT * FROM workspace_tabs WHERE tab_id = ?', [
      tabId
    ])
    if (!existing) return
    this.db.run(
      'UPDATE workspace_tabs SET position = ?, group_id = ?, pinned = ?, url = ?, title = ? WHERE tab_id = ?',
      [
        patch.position ?? existing.position,
        patch.groupId === undefined ? existing.group_id : patch.groupId,
        patch.pinned === undefined ? existing.pinned : patch.pinned ? 1 : 0,
        patch.url === undefined ? existing.url : patch.url,
        patch.title === undefined ? existing.title : patch.title,
        tabId
      ]
    )
  }

  removeTab(tabId: string): void {
    this.db.run('DELETE FROM workspace_tabs WHERE tab_id = ?', [tabId])
  }

  moveTab(tabId: string, workspaceId: string): void {
    this.db.run('UPDATE workspace_tabs SET workspace_id = ?, position = ? WHERE tab_id = ?', [
      workspaceId,
      this.nextTabPosition(workspaceId),
      tabId
    ])
  }

  countTabs(workspaceId: string): number {
    return (
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM workspace_tabs WHERE workspace_id = ?',
        [workspaceId]
      )?.count ?? 0
    )
  }

  // ----------------------------------------------------------- groups ---

  listGroups(workspaceId: string): TabGroup[] {
    return this.db
      .all<GroupRow>('SELECT * FROM tab_groups WHERE workspace_id = ? ORDER BY position', [
        workspaceId
      ])
      .map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        color: row.color,
        collapsed: row.collapsed === 1,
        position: row.position
      }))
  }

  createGroup(input: { workspaceId: string; name: string; color: string }): TabGroup {
    const id = createId('grp')
    const row = this.db.get<{ max: number | null }>(
      'SELECT MAX(position) AS max FROM tab_groups WHERE workspace_id = ?',
      [input.workspaceId]
    )
    this.db.run(
      'INSERT INTO tab_groups (id, workspace_id, name, color, collapsed, position) VALUES (?, ?, ?, ?, 0, ?)',
      [id, input.workspaceId, input.name, input.color, (row?.max ?? -1) + 1]
    )
    const created = this.db.get<GroupRow>('SELECT * FROM tab_groups WHERE id = ?', [id])
    return {
      id: created!.id,
      workspaceId: created!.workspace_id,
      name: created!.name,
      color: created!.color,
      collapsed: false,
      position: created!.position
    }
  }

  updateGroup(
    id: string,
    patch: { name?: string; color?: string; collapsed?: boolean }
  ): TabGroup | null {
    const existing = this.db.get<GroupRow>('SELECT * FROM tab_groups WHERE id = ?', [id])
    if (!existing) return null
    this.db.run('UPDATE tab_groups SET name = ?, color = ?, collapsed = ? WHERE id = ?', [
      patch.name ?? existing.name,
      patch.color ?? existing.color,
      patch.collapsed === undefined ? existing.collapsed : patch.collapsed ? 1 : 0,
      id
    ])
    const updated = this.db.get<GroupRow>('SELECT * FROM tab_groups WHERE id = ?', [id])!
    return {
      id: updated.id,
      workspaceId: updated.workspace_id,
      name: updated.name,
      color: updated.color,
      collapsed: updated.collapsed === 1,
      position: updated.position
    }
  }

  deleteGroup(id: string): boolean {
    const result = this.db.run('DELETE FROM tab_groups WHERE id = ?', [id])
    return result.changes > 0
  }

  private nextPosition(): number {
    const row = this.db.get<{ max: number | null }>('SELECT MAX(position) AS max FROM workspaces')
    return (row?.max ?? -1) + 1
  }

  private nextTabPosition(workspaceId: string): number {
    const row = this.db.get<{ max: number | null }>(
      'SELECT MAX(position) AS max FROM workspace_tabs WHERE workspace_id = ?',
      [workspaceId]
    )
    return (row?.max ?? -1) + 1
  }
}
