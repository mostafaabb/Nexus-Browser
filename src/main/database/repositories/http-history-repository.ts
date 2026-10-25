import type { HttpMethod, HttpRequestHistoryEntry } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface HistoryRow {
  id: string
  method: string
  url: string
  status: number | null
  duration_ms: number | null
  created_at: number
  error: string | null
}

export class HttpHistoryRepository {
  constructor(private readonly db: NexusDatabase) {}

  list(limit = 100): HttpRequestHistoryEntry[] {
    return this.db
      .all<HistoryRow>('SELECT * FROM http_history ORDER BY created_at DESC LIMIT ?', [limit])
      .map((row) => ({
        id: row.id,
        method: row.method as HttpMethod,
        url: row.url,
        status: row.status,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        error: row.error
      }))
  }

  add(entry: {
    method: HttpMethod
    url: string
    status: number | null
    durationMs: number | null
    error: string | null
  }): void {
    this.db.run(
      'INSERT INTO http_history (id, method, url, status, duration_ms, created_at, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        createId('hh'),
        entry.method,
        entry.url,
        entry.status,
        entry.durationMs,
        Date.now(),
        entry.error
      ]
    )
    this.db.run(
      'DELETE FROM http_history WHERE id NOT IN (SELECT id FROM http_history ORDER BY created_at DESC LIMIT 200)'
    )
  }

  clear(): number {
    return this.db.run('DELETE FROM http_history').changes
  }
}
