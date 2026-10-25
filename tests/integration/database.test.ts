import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'
import { AppError, ERROR_CODES } from '@shared/errors'

let directory: string
let service: DatabaseService

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-db-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('database bootstrap', () => {
  it('creates the file and passes the integrity check', () => {
    expect(service.integrityCheck()).toBe(true)
  })

  it('applies every migration exactly once', () => {
    const rows = service.db.all<{ version: number }>('SELECT version FROM schema_migrations')
    expect(rows.length).toBeGreaterThan(0)
    const versions = rows.map((row) => row.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('is idempotent — reopening an existing file does not re-apply migrations', () => {
    const before = service.db.all<{ version: number }>(
      'SELECT version FROM schema_migrations'
    ).length
    service.close()
    service = new DatabaseService(join(directory, 'nexus.sqlite'))
    const after = service.db.all<{ version: number }>(
      'SELECT version FROM schema_migrations'
    ).length
    expect(after).toBe(before)
  })

  it('enforces foreign keys', () => {
    expect(() =>
      service.db.run(
        'INSERT INTO workspace_tabs (workspace_id, tab_id, position, pinned, url, title) VALUES (?, ?, ?, ?, ?, ?)',
        ['missing-workspace', 'tab-1', 0, 0, 'https://a.com', 'A']
      )
    ).toThrow()
  })
})

describe('transactions', () => {
  it('commits a successful transaction', () => {
    service.db.transaction(() => {
      service.db.run(
        'INSERT INTO bookmarks (id, parent_id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['b1', null, 'Example', 'https://example.com', 0, Date.now(), Date.now()]
      )
    })
    expect(service.repositories.bookmarks.count()).toBe(1)
  })

  it('rolls back a failing transaction', () => {
    expect(() =>
      service.db.transaction(() => {
        service.db.run(
          'INSERT INTO bookmarks (id, parent_id, title, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['b1', null, 'Example', 'https://example.com', 0, Date.now(), Date.now()]
        )
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(service.repositories.bookmarks.count()).toBe(0)
  })
})

describe('error handling', () => {
  it('wraps SQL errors in an AppError', () => {
    expect.assertions(2)
    try {
      service.db.run('SELECT * FROM table_that_does_not_exist')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ERROR_CODES.DATABASE_ERROR)
    }
  })

  it('refuses to run statements on a closed database', () => {
    service.close()
    expect(() => service.db.run('SELECT 1')).toThrow(AppError)
  })
})

describe('backup', () => {
  it('creates a readable copy of the database', () => {
    service.repositories.settings.set('theme', 'light')
    const target = join(directory, 'backup.sqlite')
    service.db.backup(target)
    const copy = new DatabaseService(target)
    expect(copy.repositories.settings.getAll().theme).toBe('light')
    copy.close()
  })
})
