import type { DownloadRecord, DownloadStatus } from '@shared/types'
import type { NexusDatabase } from '../database'

interface DownloadRow {
  id: string
  url: string
  filename: string
  path: string | null
  mime_type: string | null
  total_bytes: number | null
  received_bytes: number
  status: string
  started_at: number
  ended_at: number | null
  error: string | null
  referrer: string | null
  save_as: number
}

function toRecord(row: DownloadRow): DownloadRecord {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename,
    path: row.path,
    mimeType: row.mime_type,
    totalBytes: row.total_bytes,
    receivedBytes: row.received_bytes,
    status: row.status as DownloadStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    error: row.error,
    referrer: row.referrer,
    saveAs: row.save_as === 1
  }
}

export class DownloadsRepository {
  constructor(private readonly db: NexusDatabase) {}

  list(): DownloadRecord[] {
    return this.db
      .all<DownloadRow>('SELECT * FROM downloads ORDER BY started_at DESC LIMIT 500')
      .map(toRecord)
  }

  get(id: string): DownloadRecord | null {
    const row = this.db.get<DownloadRow>('SELECT * FROM downloads WHERE id = ?', [id])
    return row ? toRecord(row) : null
  }

  create(input: {
    id: string
    url: string
    filename: string
    referrer?: string | null
    mimeType?: string | null
    saveAs?: boolean
  }): DownloadRecord {
    this.db.run(
      `INSERT INTO downloads (id, url, filename, path, mime_type, total_bytes, received_bytes, status, started_at, ended_at, error, referrer, save_as)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'progressing', ?, NULL, NULL, ?, ?)`,
      [
        input.id,
        input.url,
        input.filename,
        null,
        input.mimeType ?? null,
        null,
        Date.now(),
        input.referrer ?? null,
        input.saveAs ? 1 : 0
      ]
    )
    return this.get(input.id)!
  }

  update(
    id: string,
    patch: {
      status?: DownloadStatus
      receivedBytes?: number
      totalBytes?: number | null
      path?: string | null
      error?: string | null
      filename?: string
      endedAt?: number | null
    }
  ): DownloadRecord | null {
    const existing = this.get(id)
    if (!existing) return null
    this.db.run(
      `UPDATE downloads SET
         status = ?, received_bytes = ?, total_bytes = ?, path = ?, error = ?, filename = ?, ended_at = ?
       WHERE id = ?`,
      [
        patch.status ?? existing.status,
        patch.receivedBytes ?? existing.receivedBytes,
        patch.totalBytes === undefined ? existing.totalBytes : patch.totalBytes,
        patch.path === undefined ? existing.path : patch.path,
        patch.error === undefined ? existing.error : patch.error,
        patch.filename ?? existing.filename,
        patch.endedAt === undefined ? existing.endedAt : patch.endedAt,
        id
      ]
    )
    return this.get(id)
  }

  remove(id: string): boolean {
    const result = this.db.run('DELETE FROM downloads WHERE id = ?', [id])
    return result.changes > 0
  }

  clear(): number {
    return this.db.run('DELETE FROM downloads').changes
  }
}
