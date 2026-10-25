/** Developer toolkit types (snippet manager + HTTP/API client). */

export interface SnippetFolder {
  id: string
  name: string
  position: number
  createdAt: number
}

export interface Snippet {
  id: string
  title: string
  description: string
  code: string
  language: string
  folderId: string | null
  tags: string[]
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export interface QueryParam {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface HeaderEntry {
  id: string
  key: string
  value: string
  enabled: boolean
}

export type RequestBodyType = 'none' | 'json' | 'text' | 'form'

export interface ApiRequestRecord {
  id: string
  collectionId: string | null
  name: string
  method: HttpMethod
  url: string
  query: QueryParam[]
  headers: HeaderEntry[]
  bodyType: RequestBodyType
  body: string
  notes: string
  createdAt: number
  updatedAt: number
}

export interface ApiCollection {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  requestCount: number
}

export interface HttpResponsePayload {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyIsJson: boolean
  json: unknown | null
  durationMs: number
  sizeBytes: number
  contentType: string | null
}

export interface HttpRequestPayload {
  method: HttpMethod
  url: string
  query: QueryParam[]
  headers: HeaderEntry[]
  bodyType: RequestBodyType
  body: string
  timeoutMs: number
}

export interface HttpRequestHistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number | null
  durationMs: number | null
  createdAt: number
  error: string | null
}
