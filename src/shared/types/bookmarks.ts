/** Bookmark types. A single table stores both folders and bookmarks. */

export interface Bookmark {
  id: string
  /** null when the bookmark lives in the root of the bookmarks bar. */
  parentId: string | null
  title: string
  /** null for folders. */
  url: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface BookmarkTreeNode extends Bookmark {
  children: BookmarkTreeNode[]
}

export type BookmarkImportFormat = 'nexus-json' | 'netscape-html'

export interface BookmarkImportResult {
  imported: number
  skipped: number
  format: BookmarkImportFormat
  errors: string[]
}
