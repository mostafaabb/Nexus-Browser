import type { PermissionDecisionRecord } from '@shared/types'
import type { NexusDatabase } from '../database'

interface PermissionRow {
  origin: string
  permission: string
  decision: string
  updated_at: number
}

export class PermissionsRepository {
  constructor(private readonly db: NexusDatabase) {}

  list(): PermissionDecisionRecord[] {
    return this.db
      .all<PermissionRow>('SELECT * FROM permission_decisions ORDER BY updated_at DESC')
      .map((row) => ({
        origin: row.origin,
        permission: row.permission,
        decision: row.decision as PermissionDecisionRecord['decision'],
        updatedAt: row.updated_at
      }))
  }

  get(origin: string, permission: string): PermissionDecisionRecord | null {
    const row = this.db.get<PermissionRow>(
      'SELECT * FROM permission_decisions WHERE origin = ? AND permission = ?',
      [origin, permission]
    )
    if (!row) return null
    return {
      origin: row.origin,
      permission: row.permission,
      decision: row.decision as PermissionDecisionRecord['decision'],
      updatedAt: row.updated_at
    }
  }

  set(
    origin: string,
    permission: string,
    decision: PermissionDecisionRecord['decision']
  ): PermissionDecisionRecord {
    this.db.run(
      'INSERT INTO permission_decisions (origin, permission, decision, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(origin, permission) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at',
      [origin, permission, decision, Date.now()]
    )
    return this.get(origin, permission)!
  }

  reset(): number {
    return this.db.run('DELETE FROM permission_decisions').changes
  }
}
