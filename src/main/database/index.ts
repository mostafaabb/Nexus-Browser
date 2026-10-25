import { NexusDatabase } from './database'
import { AiRepository } from './repositories/ai-repository'
import { BookmarksRepository } from './repositories/bookmarks-repository'
import { CollectionsRepository } from './repositories/collections-repository'
import { DownloadsRepository } from './repositories/downloads-repository'
import { HistoryRepository } from './repositories/history-repository'
import { HttpHistoryRepository } from './repositories/http-history-repository'
import { PermissionsRepository } from './repositories/permissions-repository'
import { SessionsRepository } from './repositories/sessions-repository'
import { SettingsRepository } from './repositories/settings-repository'
import { SnippetsRepository } from './repositories/snippets-repository'
import { WorkspacesRepository } from './repositories/workspaces-repository'

export interface Repositories {
  settings: SettingsRepository
  bookmarks: BookmarksRepository
  history: HistoryRepository
  downloads: DownloadsRepository
  workspaces: WorkspacesRepository
  sessions: SessionsRepository
  snippets: SnippetsRepository
  collections: CollectionsRepository
  ai: AiRepository
  permissions: PermissionsRepository
  httpHistory: HttpHistoryRepository
}

/** Owns the SQLite connection and exposes typed repositories. */
export class DatabaseService {
  readonly db: NexusDatabase
  readonly repositories: Repositories

  constructor(filePath: string) {
    this.db = new NexusDatabase(filePath)
    this.repositories = {
      settings: new SettingsRepository(this.db),
      bookmarks: new BookmarksRepository(this.db),
      history: new HistoryRepository(this.db),
      downloads: new DownloadsRepository(this.db),
      workspaces: new WorkspacesRepository(this.db),
      sessions: new SessionsRepository(this.db),
      snippets: new SnippetsRepository(this.db),
      collections: new CollectionsRepository(this.db),
      ai: new AiRepository(this.db),
      permissions: new PermissionsRepository(this.db),
      httpHistory: new HttpHistoryRepository(this.db)
    }
  }

  integrityCheck(): boolean {
    return this.db.integrityCheck()
  }

  close(): void {
    this.db.close()
  }
}

export { NexusDatabase }

export type { AiRepository } from './repositories/ai-repository'
export type { BookmarksRepository } from './repositories/bookmarks-repository'
export type { CollectionsRepository } from './repositories/collections-repository'
export type { DownloadsRepository } from './repositories/downloads-repository'
export type { HistoryRepository } from './repositories/history-repository'
export type { HttpHistoryRepository } from './repositories/http-history-repository'
export type { PermissionsRepository } from './repositories/permissions-repository'
export type { SessionsRepository } from './repositories/sessions-repository'
export type { SettingsRepository } from './repositories/settings-repository'
export type { SnippetsRepository } from './repositories/snippets-repository'
export type { WorkspacesRepository } from './repositories/workspaces-repository'
