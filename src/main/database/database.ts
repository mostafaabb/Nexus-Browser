import { Database } from 'node-sqlite3-wasm'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ERROR_CODES, AppError } from '@shared/errors'
import { MIGRATIONS } from './migrations'

export type SqlValue = string | number | bigint | null | Uint8Array
export type SqlParams = SqlValue[] | Record<string, SqlValue> | undefined

export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

/**
 * Thin, synchronous wrapper around the SQLite WASM build used by Nexus.
 *
 * A WASM build is used deliberately: it removes the native-module ABI
 * dependency on Electron versions while keeping a real, file-backed SQLite
 * database with full SQL support, foreign keys and migrations.
 */
export class NexusDatabase {
  private readonly db: Database
  private closed = false

  constructor(readonly filePath: string) {
    const directory = dirname(filePath)
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true })
    }
    try {
      this.db = new Database(filePath)
    } catch (error) {
      throw new AppError(
        ERROR_CODES.DATABASE_ERROR,
        `Could not open the local database: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);'
    )
    const applied = new Set(
      this.all<{ version: number }>('SELECT version FROM schema_migrations').map(
        (row) => row.version
      )
    )

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      this.transaction(() => {
        migration.up((sql) => this.db.exec(sql))
        this.db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
          migration.version,
          migration.name,
          Date.now()
        ])
      })
    }
  }

  run(sql: string, params?: SqlParams): RunResult {
    this.assertOpen()
    try {
      return this.db.run(sql, params)
    } catch (error) {
      throw this.wrap(error, sql)
    }
  }

  get<T>(sql: string, params?: SqlParams): T | null {
    this.assertOpen()
    try {
      const row = this.db.get(sql, params)
      return (row as T | null) ?? null
    } catch (error) {
      throw this.wrap(error, sql)
    }
  }

  all<T>(sql: string, params?: SqlParams): T[] {
    this.assertOpen()
    try {
      return this.db.all(sql, params) as T[]
    } catch (error) {
      throw this.wrap(error, sql)
    }
  }

  exec(sql: string): void {
    this.assertOpen()
    try {
      this.db.exec(sql)
    } catch (error) {
      throw this.wrap(error, sql)
    }
  }

  /** Runs `fn` inside a transaction, rolling back on error. */
  transaction<T>(fn: () => T): T {
    this.assertOpen()
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // The transaction was already rolled back by SQLite.
      }
      throw error
    }
  }

  /** Returns true when SQLite reports no corruption. */
  integrityCheck(): boolean {
    const rows = this.all<{ integrity_check: string }>('PRAGMA integrity_check')
    return rows.length > 0 && rows[0]?.integrity_check === 'ok'
  }

  /** Creates a consistent copy of the database file. */
  backup(targetPath: string): void {
    const directory = dirname(targetPath)
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    try {
      this.db.exec(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`)
    } catch {
      // Older SQLite builds do not support VACUUM INTO — fall back to a copy.
      copyFileSync(this.filePath, targetPath)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.db.close()
    } catch {
      // Ignore double-close errors during shutdown.
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new AppError(ERROR_CODES.DATABASE_ERROR, 'The local database is closed.')
    }
  }

  private wrap(error: unknown, sql: string): AppError {
    const message = error instanceof Error ? error.message : String(error)
    return new AppError(ERROR_CODES.DATABASE_ERROR, `Database error: ${message}`, { sql })
  }
}
