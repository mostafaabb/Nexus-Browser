import { ERROR_CODES, AppError } from '@shared/errors'
import type { ApiCollection, ApiRequestRecord, Bookmark } from '@shared/types'

export interface ExportResult {
  fileName: string
  content: string
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export interface ImportedBookmark {
  title: string
  url: string
  parentId?: string | null
}

export interface ImportedCollection {
  name: string
  description: string
  requests: Array<{
    name: string
    method: string
    url: string
    query: unknown
    headers: unknown
    bodyType: string
    body: string
    notes: string
  }>
}

/* --------------------------------------------------------------- export --- */

export function exportBookmarksJson(bookmarks: Bookmark[]): ExportResult {
  const payload = {
    format: 'nexus-bookmarks',
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: bookmarks.map((bookmark) => ({
      title: bookmark.title,
      url: bookmark.url,
      position: bookmark.position,
      parent: bookmark.parentId
    }))
  }
  return {
    fileName: `nexus-bookmarks-${stamp()}.json`,
    content: JSON.stringify(payload, null, 2)
  }
}

export function exportBookmarksHtml(bookmarks: Bookmark[]): ExportResult {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ]

  const byParent = new Map<string | null, Bookmark[]>()
  for (const bookmark of bookmarks) {
    const list = byParent.get(bookmark.parentId) ?? []
    list.push(bookmark)
    byParent.set(bookmark.parentId, list)
  }

  const walk = (parentId: string | null, depth: number): void => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position)
    for (const child of children) {
      const indent = '    '.repeat(depth)
      if (child.url) {
        lines.push(
          `${indent}<DT><A HREF="${escapeAttribute(child.url)}">${escapeHtml(child.title)}</A>`
        )
      } else {
        lines.push(`${indent}<DT><H3>${escapeHtml(child.title)}</H3>`)
        lines.push(`${indent}<DL><p>`)
        walk(child.id, depth + 1)
        lines.push(`${indent}</DL><p>`)
      }
    }
  }

  walk(null, 1)
  lines.push('</DL><p>')
  return {
    fileName: `nexus-bookmarks-${stamp()}.html`,
    content: lines.join('\n')
  }
}

/* --------------------------------------------------------------- import --- */

/**
 * Parses a bookmarks file. The content is treated as untrusted data: only
 * plain text is extracted, nothing is ever executed.
 */
export function importBookmarks(
  content: string,
  fileName: string
): {
  bookmarks: ImportedBookmark[]
  errors: string[]
} {
  const trimmed = content.trim()
  if (!trimmed) {
    throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'The selected file is empty.')
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return importBookmarksJson(trimmed)
  }
  if (/^<!DOCTYPE\s+NETSCAPE-Bookmark-file/i.test(trimmed) || /<A\s+HREF=/i.test(trimmed)) {
    return importBookmarksHtml(trimmed)
  }
  throw new AppError(
    ERROR_CODES.INVALID_ARGUMENT,
    `"${fileName}" is not a supported bookmarks file. Use a Nexus JSON export or a Netscape HTML bookmark file.`
  )
}

function importBookmarksJson(content: string): { bookmarks: ImportedBookmark[]; errors: string[] } {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'The JSON bookmarks file could not be parsed.')
  }

  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { bookmarks?: unknown }).bookmarks)
      ? ((parsed as { bookmarks: unknown[] }).bookmarks as unknown[])
      : []

  const bookmarks: ImportedBookmark[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      errors.push('Skipped an entry that was not an object.')
      continue
    }
    const record = entry as { title?: unknown; url?: unknown }
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (!title || !url || !isSafeBookmarkUrl(url)) {
      errors.push(
        `Skipped "${title || url || 'unnamed entry'}": the URL is missing or unsupported.`
      )
      continue
    }
    bookmarks.push({ title, url })
  }
  return { bookmarks, errors }
}

function importBookmarksHtml(content: string): { bookmarks: ImportedBookmark[]; errors: string[] } {
  const errors: string[] = []
  const bookmarks: ImportedBookmark[] = []
  const anchorRe =
    /<a\s+([^>]*?)href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(content)) !== null) {
    const url = decodeEntities((match[3] ?? match[4] ?? match[5] ?? '').trim())
    const rawTitle = stripTags(match[7] ?? '')
    const title = decodeEntities(rawTitle).trim() || url
    if (!url || !isSafeBookmarkUrl(url)) {
      errors.push(`Skipped "${title}": the URL is missing or unsupported.`)
      continue
    }
    bookmarks.push({ title, url })
  }

  if (!bookmarks.length && !errors.length) {
    errors.push('No bookmarks were found in the file.')
  }
  return { bookmarks, errors }
}

function isSafeBookmarkUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'nexus:'
    )
  } catch {
    return false
  }
}

/* ---------------------------------------------------- collection import --- */

export function exportCollections(
  collections: ApiCollection[],
  requests: ApiRequestRecord[]
): ExportResult {
  const payload = {
    format: 'nexus-collections',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: collections.map((collection) => ({
      name: collection.name,
      description: collection.description,
      requests: requests
        .filter((request) => request.collectionId === collection.id)
        .map((request) => ({
          name: request.name,
          method: request.method,
          url: request.url,
          query: request.query,
          headers: request.headers,
          bodyType: request.bodyType,
          body: request.body,
          notes: request.notes
        }))
    }))
  }
  return {
    fileName: `nexus-collections-${stamp()}.json`,
    content: JSON.stringify(payload, null, 2)
  }
}

export function importCollections(content: string): {
  collections: ImportedCollection[]
  errors: string[]
} {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new AppError(
      ERROR_CODES.INVALID_ARGUMENT,
      'The collection file could not be parsed as JSON.'
    )
  }

  const rawCollections =
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray((parsed as { collections?: unknown }).collections)
      ? ((parsed as { collections: unknown[] }).collections as unknown[])
      : []

  const collections: ImportedCollection[] = []
  for (const entry of rawCollections) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as {
      name?: unknown
      description?: unknown
      requests?: unknown
    }
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) {
      errors.push('Skipped a collection without a name.')
      continue
    }
    const requests: ImportedCollection['requests'] = []
    if (Array.isArray(record.requests)) {
      for (const requestEntry of record.requests) {
        if (!requestEntry || typeof requestEntry !== 'object') continue
        const request = requestEntry as Record<string, unknown>
        const url = typeof request['url'] === 'string' ? request['url'].trim() : ''
        if (!url || !isSafeHttpUrl(url)) {
          errors.push(`Skipped a request in "${name}": the URL is missing or unsupported.`)
          continue
        }
        requests.push({
          name: typeof request['name'] === 'string' ? request['name'] : url,
          method: typeof request['method'] === 'string' ? request['method'] : 'GET',
          url,
          query: Array.isArray(request['query']) ? request['query'] : [],
          headers: Array.isArray(request['headers']) ? request['headers'] : [],
          bodyType: typeof request['bodyType'] === 'string' ? request['bodyType'] : 'none',
          body: typeof request['body'] === 'string' ? request['body'] : '',
          notes: typeof request['notes'] === 'string' ? request['notes'] : ''
        })
      }
    }
    collections.push({
      name,
      description: typeof record.description === 'string' ? record.description : '',
      requests
    })
  }

  if (!collections.length && !errors.length) {
    errors.push('No collections were found in the file.')
  }
  return { collections, errors }
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/* --------------------------------------------------------------- helpers --- */

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&amp;/g, '&')
}
