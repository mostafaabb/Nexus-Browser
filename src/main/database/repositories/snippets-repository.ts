import type { Snippet, SnippetFolder } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface SnippetRow {
  id: string
  title: string
  description: string
  code: string
  language: string
  folder_id: string | null
  tags: string
  favorite: number
  created_at: number
  updated_at: number
}

interface FolderRow {
  id: string
  name: string
  position: number
  created_at: number
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : []
  } catch {
    return []
  }
}

function toSnippet(row: SnippetRow): Snippet {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    code: row.code,
    language: row.language,
    folderId: row.folder_id,
    tags: parseTags(row.tags),
    favorite: row.favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class SnippetsRepository {
  constructor(private readonly db: NexusDatabase) {}

  listFolders(): SnippetFolder[] {
    return this.db
      .all<FolderRow>('SELECT * FROM snippet_folders ORDER BY position, name')
      .map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        createdAt: row.created_at
      }))
  }

  createFolder(name: string): SnippetFolder {
    const id = createId('sfd')
    const row = this.db.get<{ max: number | null }>(
      'SELECT MAX(position) AS max FROM snippet_folders'
    )
    this.db.run(
      'INSERT INTO snippet_folders (id, name, position, created_at) VALUES (?, ?, ?, ?)',
      [id, name, (row?.max ?? -1) + 1, Date.now()]
    )
    const created = this.db.get<FolderRow>('SELECT * FROM snippet_folders WHERE id = ?', [id])!
    return {
      id: created.id,
      name: created.name,
      position: created.position,
      createdAt: created.created_at
    }
  }

  deleteFolder(id: string): boolean {
    return this.db.run('DELETE FROM snippet_folders WHERE id = ?', [id]).changes > 0
  }

  list(query: { search?: string; folderId?: string | null; tag?: string } = {}): Snippet[] {
    const conditions: string[] = []
    const params: Array<string | number> = []

    const search = query.search?.trim()
    if (search) {
      conditions.push(
        "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')"
      )
      const like = `%${search.replace(/[%_]/g, (match) => `\\${match}`)}%`
      params.push(like, like, like)
    }
    if (query.folderId !== undefined) {
      if (query.folderId === null) {
        conditions.push('folder_id IS NULL')
      } else {
        conditions.push('folder_id = ?')
        params.push(query.folderId)
      }
    }
    if (query.tag) {
      conditions.push("tags LIKE ? ESCAPE '\\'")
      params.push(`%${query.tag.replace(/[%_]/g, (match) => `\\${match}`)}%`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.db
      .all<SnippetRow>(
        `SELECT * FROM snippets ${where} ORDER BY favorite DESC, updated_at DESC LIMIT 1000`,
        params
      )
      .map(toSnippet)
  }

  get(id: string): Snippet | null {
    const row = this.db.get<SnippetRow>('SELECT * FROM snippets WHERE id = ?', [id])
    return row ? toSnippet(row) : null
  }

  save(input: {
    id?: string
    title: string
    description?: string
    code: string
    language: string
    folderId?: string | null
    tags?: string[]
    favorite?: boolean
  }): Snippet {
    const now = Date.now()
    if (input.id) {
      const existing = this.get(input.id)
      if (existing) {
        this.db.run(
          'UPDATE snippets SET title = ?, description = ?, code = ?, language = ?, folder_id = ?, tags = ?, favorite = ?, updated_at = ? WHERE id = ?',
          [
            input.title,
            input.description ?? existing.description,
            input.code,
            input.language,
            input.folderId === undefined ? existing.folderId : input.folderId,
            JSON.stringify(input.tags ?? existing.tags),
            (input.favorite ?? existing.favorite) ? 1 : 0,
            now,
            input.id
          ]
        )
        return this.get(input.id)!
      }
    }
    const id = createId('snp')
    this.db.run(
      'INSERT INTO snippets (id, title, description, code, language, folder_id, tags, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.title,
        input.description ?? '',
        input.code,
        input.language,
        input.folderId ?? null,
        JSON.stringify(input.tags ?? []),
        input.favorite ? 1 : 0,
        now,
        now
      ]
    )
    return this.get(id)!
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM snippets WHERE id = ?', [id]).changes > 0
  }

  count(): number {
    return this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM snippets')?.count ?? 0
  }
}
