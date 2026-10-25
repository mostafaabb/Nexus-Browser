import type {
  ApiCollection,
  ApiRequestRecord,
  HeaderEntry,
  HttpMethod,
  QueryParam,
  RequestBodyType
} from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface CollectionRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

interface RequestRow {
  id: string
  collection_id: string | null
  name: string
  method: string
  url: string
  query: string
  headers: string
  body_type: string
  body: string
  notes: string
  created_at: number
  updated_at: number
}

function parseArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

function toRequest(row: RequestRow): ApiRequestRecord {
  return {
    id: row.id,
    collectionId: row.collection_id,
    name: row.name,
    method: (row.method as HttpMethod) ?? 'GET',
    url: row.url,
    query: parseArray<QueryParam>(row.query, []),
    headers: parseArray<HeaderEntry>(row.headers, []),
    bodyType: (row.body_type as RequestBodyType) ?? 'none',
    body: row.body,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class CollectionsRepository {
  constructor(private readonly db: NexusDatabase) {}

  listCollections(): ApiCollection[] {
    const rows = this.db.all<CollectionRow>('SELECT * FROM api_collections ORDER BY created_at')
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestCount: this.countRequests(row.id)
    }))
  }

  getCollection(id: string): ApiCollection | null {
    const row = this.db.get<CollectionRow>('SELECT * FROM api_collections WHERE id = ?', [id])
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestCount: this.countRequests(row.id)
    }
  }

  createCollection(name: string, description = ''): ApiCollection {
    const now = Date.now()
    const id = createId('col')
    this.db.run(
      'INSERT INTO api_collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, description, now, now]
    )
    return this.getCollection(id)!
  }

  updateCollection(
    id: string,
    patch: { name?: string; description?: string }
  ): ApiCollection | null {
    const existing = this.getCollection(id)
    if (!existing) return null
    this.db.run(
      'UPDATE api_collections SET name = ?, description = ?, updated_at = ? WHERE id = ?',
      [patch.name ?? existing.name, patch.description ?? existing.description, Date.now(), id]
    )
    return this.getCollection(id)
  }

  deleteCollection(id: string): boolean {
    return this.db.run('DELETE FROM api_collections WHERE id = ?', [id]).changes > 0
  }

  listRequests(collectionId?: string | null): ApiRequestRecord[] {
    if (collectionId === undefined) {
      return this.db
        .all<RequestRow>('SELECT * FROM api_requests ORDER BY updated_at DESC')
        .map(toRequest)
    }
    if (collectionId === null) {
      return this.db
        .all<RequestRow>(
          'SELECT * FROM api_requests WHERE collection_id IS NULL ORDER BY updated_at DESC'
        )
        .map(toRequest)
    }
    return this.db
      .all<RequestRow>(
        'SELECT * FROM api_requests WHERE collection_id = ? ORDER BY updated_at DESC',
        [collectionId]
      )
      .map(toRequest)
  }

  getRequest(id: string): ApiRequestRecord | null {
    const row = this.db.get<RequestRow>('SELECT * FROM api_requests WHERE id = ?', [id])
    return row ? toRequest(row) : null
  }

  saveRequest(input: {
    id?: string
    collectionId: string | null
    name: string
    method: HttpMethod
    url: string
    query: QueryParam[]
    headers: HeaderEntry[]
    bodyType: RequestBodyType
    body: string
    notes: string
  }): ApiRequestRecord {
    const now = Date.now()
    if (input.id && this.getRequest(input.id)) {
      this.db.run(
        `UPDATE api_requests SET collection_id = ?, name = ?, method = ?, url = ?, query = ?, headers = ?, body_type = ?, body = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.collectionId,
          input.name,
          input.method,
          input.url,
          JSON.stringify(input.query),
          JSON.stringify(input.headers),
          input.bodyType,
          input.body,
          input.notes,
          now,
          input.id
        ]
      )
      return this.getRequest(input.id)!
    }
    const id = createId('req')
    this.db.run(
      `INSERT INTO api_requests (id, collection_id, name, method, url, query, headers, body_type, body, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.collectionId,
        input.name,
        input.method,
        input.url,
        JSON.stringify(input.query),
        JSON.stringify(input.headers),
        input.bodyType,
        input.body,
        input.notes,
        now,
        now
      ]
    )
    return this.getRequest(id)!
  }

  deleteRequest(id: string): boolean {
    return this.db.run('DELETE FROM api_requests WHERE id = ?', [id]).changes > 0
  }

  countRequests(collectionId: string): number {
    return (
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM api_requests WHERE collection_id = ?',
        [collectionId]
      )?.count ?? 0
    )
  }
}
