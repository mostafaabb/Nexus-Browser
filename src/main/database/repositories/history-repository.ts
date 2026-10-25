import type { HistoryEntry, HistoryQuery, HistoryRange } from '@shared/types'
import type { NexusDatabase } from '../database'

interface HistoryRow {
  id: string
  url: string
  title: string
  visited_at: number
  first_visited_at: number
  visit_count: number
}

function toEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    visitedAt: row.visited_at,
    firstVisitedAt: row.first_visited_at,
    visitCount: row.visit_count
  }
}

function rangeStart(range: HistoryRange | undefined): number | null {
  if (!range || range === 'all') return null
  const now = Date.now()
  switch (range) {
    case 'hour':
      return now - 60 * 60 * 1000
    case 'day':
      return now - 24 * 60 * 60 * 1000
    case 'week':
      return now - 7 * 24 * 60 * 60 * 1000
    case 'month':
      return now - 30 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

export class HistoryRepository {
  constructor(private readonly db: NexusDatabase) {}

  record(url: string, title: string): void {
    const now = Date.now()
    this.db.run(
      `INSERT INTO history (id, url, title, visited_at, first_visited_at, visit_count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(url) DO UPDATE SET
         visited_at = excluded.visited_at,
         title = CASE WHEN excluded.title != '' THEN excluded.title ELSE history.title END,
         visit_count = history.visit_count + 1`,
      [crypto.randomUUID(), url, title, now, now]
    )
  }

  /**
   * Updates the title of an already recorded entry.
   *
   * The title is usually only known after the document finished loading, so it
   * arrives in a separate event than the navigation itself. This must not
   * count as another visit.
   */
  updateTitle(url: string, title: string): void {
    if (!title) return
    this.db.run('UPDATE history SET title = ? WHERE url = ?', [title, url])
  }

  query(query: HistoryQuery = {}): HistoryEntry[] {
    const conditions: string[] = []
    const params: Array<string | number> = []

    const search = query.search?.trim()
    if (search) {
      conditions.push("(title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')")
      const like = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`
      params.push(like, like)
    }

    const start = rangeStart(query.range)
    if (start !== null) {
      conditions.push('visited_at >= ?')
      params.push(start)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000)
    const offset = Math.max(query.offset ?? 0, 0)

    return this.db
      .all<HistoryRow>(`SELECT * FROM history ${where} ORDER BY visited_at DESC LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset
      ])
      .map(toEntry)
  }

  remove(ids: string[]): number {
    if (!ids.length) return 0
    let removed = 0
    this.db.transaction(() => {
      for (const id of ids) {
        removed += this.db.run('DELETE FROM history WHERE id = ?', [id]).changes
      }
    })
    return removed
  }

  clear(range?: HistoryRange): number {
    const start = rangeStart(range)
    const result =
      start === null
        ? this.db.run('DELETE FROM history')
        : this.db.run('DELETE FROM history WHERE visited_at >= ?', [start])
    return result.changes
  }

  count(): number {
    return this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM history')?.count ?? 0
  }

  /** Returns the most visited origins — used by the start page. */
  topSites(limit = 8): Array<{ url: string; title: string; visitCount: number }> {
    return this.db
      .all<{ url: string; title: string; visit_count: number }>(
        'SELECT url, title, visit_count FROM history ORDER BY visited_at DESC LIMIT ?',
        [limit]
      )
      .map((row) => ({ url: row.url, title: row.title, visitCount: row.visit_count }))
  }
}
