import type { AppSettings } from '@shared/types'
import { DEFAULT_SEARCH_ENGINE_ID } from '@shared/constants/search-engines'
import { DEFAULT_HTTP_TIMEOUT_MS } from '@shared/constants/app'
import type { NexusDatabase } from '../database'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accent: 'violet',
  sidebarMode: 'icons',
  showBookmarksBar: true,
  startupBehavior: 'new-tab',
  defaultWorkspaceId: null,
  homePage: 'nexus://start',
  searchEngineId: DEFAULT_SEARCH_ENGINE_ID,
  customSearchTemplate: '',
  askWhereToSave: false,
  downloadDirectory: null,
  showDownloadNotifications: true,
  recordHistory: true,
  clearHistoryOnExit: false,
  saveAiConversations: true,
  includePageContextByDefault: false,
  aiDefaultProvider: 'mock',
  aiDefaultModel: 'nexus-mock-1',
  aiTimeoutMs: 60_000,
  httpDefaultTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
  editorFontSize: 13,
  editorTabSize: 2,
  reduceMotion: false,
  onboardingCompleted: false,
  zoomPerSite: true,
  blockThirdPartyCookies: false
}

export class SettingsRepository {
  constructor(private readonly db: NexusDatabase) {}

  getAll(): AppSettings {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const result: AppSettings = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      if (!(row.key in DEFAULT_SETTINGS)) continue
      try {
        const parsed: unknown = JSON.parse(row.value)
        ;(result as unknown as Record<string, unknown>)[row.key] = parsed
      } catch {
        // Ignore malformed rows and keep the default value.
      }
    }
    return result
  }

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
    this.db.run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, JSON.stringify(value), Date.now()]
    )
    return this.getAll()
  }

  setMany(patch: Partial<AppSettings>): AppSettings {
    const now = Date.now()
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(patch)) {
        this.db.run(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          [key, JSON.stringify(value), now]
        )
      }
    })
    return this.getAll()
  }

  reset(): AppSettings {
    this.db.run('DELETE FROM settings')
    return { ...DEFAULT_SETTINGS }
  }

  /** Reads a raw (non `AppSettings`) key, e.g. the AI provider configuration. */
  getRaw<T>(key: string): T | null {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  /** Writes a raw (non `AppSettings`) key. */
  setRaw(key: string, value: unknown): void {
    this.db.run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, JSON.stringify(value), Date.now()]
    )
  }
}
