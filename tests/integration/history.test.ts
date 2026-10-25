import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'

let directory: string
let service: DatabaseService
let repo: DatabaseService['repositories']['history']

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-history-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
  repo = service.repositories.history
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('history repository', () => {
  it('records a visit', () => {
    repo.record('https://example.com', 'Example')
    const entries = repo.query()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.url).toBe('https://example.com')
    expect(entries[0]?.visitCount).toBe(1)
  })

  it('merges repeated visits of the same url', () => {
    repo.record('https://example.com', 'Example')
    repo.record('https://example.com', 'Example again')
    const entries = repo.query()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.visitCount).toBe(2)
    expect(entries[0]?.title).toBe('Example again')
  })

  it('keeps the previous title when the new one is empty', () => {
    repo.record('https://example.com', 'Example')
    repo.record('https://example.com', '')
    expect(repo.query()[0]?.title).toBe('Example')
  })

  it('updates the title of an existing entry without adding a visit', () => {
    repo.record('https://example.com', '')
    expect(repo.query()[0]?.title).toBe('')
    repo.updateTitle('https://example.com', 'Example Domain')
    const [entry] = repo.query()
    expect(entry?.title).toBe('Example Domain')
    expect(entry?.visitCount).toBe(1)
  })

  it('ignores a title update for an unknown url or an empty title', () => {
    repo.record('https://example.com', 'Example')
    repo.updateTitle('https://example.com', '')
    repo.updateTitle('https://unknown.example', 'Unknown')
    expect(repo.query()).toHaveLength(1)
    expect(repo.query()[0]?.title).toBe('Example')
  })

  it('searches by title and url', () => {
    repo.record('https://alpha.example', 'Alpha')
    repo.record('https://beta.example', 'Beta')
    expect(repo.query({ search: 'alpha' })).toHaveLength(1)
    expect(repo.query({ search: 'Beta' })).toHaveLength(1)
  })

  it('honours the limit and offset', () => {
    repo.record('https://a.example', 'A')
    repo.record('https://b.example', 'B')
    repo.record('https://c.example', 'C')
    expect(repo.query({ limit: 2 })).toHaveLength(2)
    expect(repo.query({ limit: 2, offset: 2 })).toHaveLength(1)
  })

  it('removes entries by id', () => {
    repo.record('https://a.example', 'A')
    repo.record('https://b.example', 'B')
    const [entry] = repo.query()
    expect(repo.remove([entry!.id])).toBe(1)
    expect(repo.count()).toBe(1)
  })

  it('ignores an empty removal request', () => {
    repo.record('https://a.example', 'A')
    expect(repo.remove([])).toBe(0)
    expect(repo.count()).toBe(1)
  })

  it('clears the whole history', () => {
    repo.record('https://a.example', 'A')
    repo.record('https://b.example', 'B')
    expect(repo.clear('all')).toBe(2)
    expect(repo.count()).toBe(0)
  })

  it('clears only the entries of a time range', () => {
    repo.record('https://a.example', 'A')
    const old = Date.now() - 60 * 60 * 1000 * 24 * 40
    service.db.run(
      'INSERT INTO history (id, url, title, visited_at, first_visited_at, visit_count) VALUES (?, ?, ?, ?, ?, ?)',
      ['old-entry', 'https://old.example', 'Old', old, old, 1]
    )
    expect(repo.count()).toBe(2)
    expect(repo.clear('day')).toBe(1)
    expect(repo.count()).toBe(1)
    expect(repo.query()[0]?.url).toBe('https://old.example')
  })

  it('lists the most recent sites', () => {
    repo.record('https://a.example', 'A')
    repo.record('https://b.example', 'B')
    expect(repo.topSites(1)).toHaveLength(1)
  })
})
