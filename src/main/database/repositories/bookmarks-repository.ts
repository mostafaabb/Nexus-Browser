import type { Bookmark } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface BookmarkRow {
  id: string
  parent_id: string | null
  title: string
  url: string | null
  position: number
  created_at: number
  updated_at: number
}

function toBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    url: row.url,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class BookmarksRepository {
  constructor(private readonly db: NexusDatabase) {}

  list(): Bookmark[] {
    return this.db
      .all<BookmarkRow>(
        'SELECT * FROM bookmarks ORDER BY parent_id IS NOT NULL, parent_id, position, title'
      )
      .map(toBookmark)
  }

  getById(id: string): Bookmark | null {
    const row = this.db.get<BookmarkRow>('SELECT * FROM bookmarks WHERE id = ?', [id])
    return row ? toBookmark(row) : null
  }

  create(input: { title: string; url: string; parentId?: string | null }): Bookmark {
    const now = Date.now()
    const id = createId('bm')
    const position = this.nextPosition(input.parentId ?? null)
    this.db.run(
      'INSERT INTO bookmarks (id, parent_id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, input.parentId ?? null, input.title, input.url, position, now, now]
    )
    return this.getById(id)!
  }

  createFolder(input: { title: string; parentId?: string | null }): Bookmark {
    const now = Date.now()
    const id = createId('bmf')
    const position = this.nextPosition(input.parentId ?? null)
    this.db.run(
      'INSERT INTO bookmarks (id, parent_id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, input.parentId ?? null, input.title, null, position, now, now]
    )
    return this.getById(id)!
  }

  update(id: string, patch: { title?: string; url?: string }): Bookmark | null {
    const existing = this.getById(id)
    if (!existing) return null
    const title = patch.title ?? existing.title
    const url = patch.url ?? existing.url
    this.db.run('UPDATE bookmarks SET title = ?, url = ?, updated_at = ? WHERE id = ?', [
      title,
      url,
      Date.now(),
      id
    ])
    return this.getById(id)
  }

  delete(id: string): boolean {
    const existing = this.getById(id)
    if (!existing) return false
    this.db.run('DELETE FROM bookmarks WHERE id = ?', [id])
    return true
  }

  move(id: string, parentId: string | null, position: number): Bookmark | null {
    if (parentId && parentId === id) return null
    if (parentId && !this.getById(parentId)) return null
    const siblings = this.childrenOf(parentId).filter((item) => item.id !== id)
    const index = Math.max(0, Math.min(position, siblings.length))
    siblings.splice(index, 0, this.getById(id)!)
    this.db.transaction(() => {
      siblings.forEach((item, itemIndex) => {
        this.db.run(
          'UPDATE bookmarks SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?',
          [parentId, itemIndex, Date.now(), item.id]
        )
      })
    })
    return this.getById(id)
  }

  reorder(parentId: string | null, orderedIds: string[]): Bookmark[] {
    this.db.transaction(() => {
      orderedIds.forEach((id, index) => {
        this.db.run(
          'UPDATE bookmarks SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?',
          [parentId, index, Date.now(), id]
        )
      })
    })
    return this.childrenOf(parentId)
  }

  search(query: string): Bookmark[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const like = `%${trimmed.replace(/[%_]/g, (match) => `\\${match}`)}%`
    return this.db
      .all<BookmarkRow>(
        "SELECT * FROM bookmarks WHERE url IS NOT NULL AND (title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\') ORDER BY title LIMIT 200",
        [like, like]
      )
      .map(toBookmark)
  }

  /** Removes bookmarks whose URL already exists in the tree. */
  findDuplicate(url: string): Bookmark | null {
    const row = this.db.get<BookmarkRow>('SELECT * FROM bookmarks WHERE url = ? LIMIT 1', [url])
    return row ? toBookmark(row) : null
  }

  count(): number {
    const row = this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM bookmarks')
    return row?.count ?? 0
  }

  clear(): number {
    const row = this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM bookmarks')
    this.db.run('DELETE FROM bookmarks')
    return row?.count ?? 0
  }

  /** Bulk insert used by the import flow. */
  insertMany(items: Array<{ title: string; url: string; parentId?: string | null }>): number {
    const now = Date.now()
    let inserted = 0
    this.db.transaction(() => {
      for (const item of items) {
        const id = createId('bm')
        const position = this.nextPosition(item.parentId ?? null)
        this.db.run(
          'INSERT INTO bookmarks (id, parent_id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, item.parentId ?? null, item.title, item.url, position, now, now]
        )
        inserted += 1
      }
    })
    return inserted
  }

  childrenOf(parentId: string | null): Bookmark[] {
    if (parentId === null) {
      return this.db
        .all<BookmarkRow>(
          'SELECT * FROM bookmarks WHERE parent_id IS NULL ORDER BY position, title'
        )
        .map(toBookmark)
    }
    return this.db
      .all<BookmarkRow>('SELECT * FROM bookmarks WHERE parent_id = ? ORDER BY position, title', [
        parentId
      ])
      .map(toBookmark)
  }

  private nextPosition(parentId: string | null): number {
    const row = this.db.get<{ max: number | null }>(
      parentId === null
        ? 'SELECT MAX(position) AS max FROM bookmarks WHERE parent_id IS NULL'
        : 'SELECT MAX(position) AS max FROM bookmarks WHERE parent_id = ?',
      parentId === null ? undefined : [parentId]
    )
    return (row?.max ?? -1) + 1
  }
}
