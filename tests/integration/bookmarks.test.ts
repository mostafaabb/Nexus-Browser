import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'

let directory: string
let service: DatabaseService
let repo: DatabaseService['repositories']['bookmarks']

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-bookmarks-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
  repo = service.repositories.bookmarks
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('bookmarks repository', () => {
  it('starts empty', () => {
    expect(repo.count()).toBe(0)
    expect(repo.list()).toEqual([])
  })

  it('creates a bookmark with an id and a position', () => {
    const bookmark = repo.create({ title: 'Example', url: 'https://example.com' })
    expect(bookmark.id).toBeTruthy()
    expect(bookmark.title).toBe('Example')
    expect(bookmark.url).toBe('https://example.com')
    expect(bookmark.parentId).toBeNull()
    expect(bookmark.position).toBe(0)
  })

  it('appends new bookmarks to the end of their parent', () => {
    repo.create({ title: 'First', url: 'https://a.com' })
    const second = repo.create({ title: 'Second', url: 'https://b.com' })
    expect(second.position).toBe(1)
  })

  it('creates a folder without a url', () => {
    const folder = repo.createFolder({ title: 'Reading list' })
    expect(folder.url).toBeNull()
  })

  it('updates a bookmark', () => {
    const bookmark = repo.create({ title: 'Old', url: 'https://a.com' })
    const updated = repo.update(bookmark.id, { title: 'New' })
    expect(updated?.title).toBe('New')
    expect(updated?.url).toBe('https://a.com')
  })

  it('returns null when updating an unknown bookmark', () => {
    expect(repo.update('does-not-exist', { title: 'x' })).toBeNull()
  })

  it('deletes a bookmark', () => {
    const bookmark = repo.create({ title: 'Gone', url: 'https://a.com' })
    expect(repo.delete(bookmark.id)).toBe(true)
    expect(repo.count()).toBe(0)
    expect(repo.delete(bookmark.id)).toBe(false)
  })

  it('moves a bookmark into a folder', () => {
    const folder = repo.createFolder({ title: 'Folder' })
    const bookmark = repo.create({ title: 'Page', url: 'https://a.com' })
    const moved = repo.move(bookmark.id, folder.id, 0)
    expect(moved?.parentId).toBe(folder.id)
    expect(repo.childrenOf(null)).toHaveLength(1)
    expect(repo.childrenOf(folder.id)).toHaveLength(1)
  })

  it('refuses to move a bookmark into itself', () => {
    const folder = repo.createFolder({ title: 'Folder' })
    expect(repo.move(folder.id, folder.id, 0)).toBeNull()
  })

  it('refuses to move a bookmark into an unknown folder', () => {
    const bookmark = repo.create({ title: 'Page', url: 'https://a.com' })
    expect(repo.move(bookmark.id, 'nope', 0)).toBeNull()
  })

  it('reorders siblings', () => {
    const a = repo.create({ title: 'A', url: 'https://a.com' })
    const b = repo.create({ title: 'B', url: 'https://b.com' })
    const c = repo.create({ title: 'C', url: 'https://c.com' })
    repo.reorder(null, [c.id, a.id, b.id])
    expect(repo.childrenOf(null).map((item) => item.title)).toEqual(['C', 'A', 'B'])
  })

  it('searches by title and url', () => {
    repo.create({ title: 'Alpha', url: 'https://alpha.example' })
    repo.create({ title: 'Beta', url: 'https://beta.example' })
    expect(repo.search('alpha')).toHaveLength(1)
    expect(repo.search('beta.example')).toHaveLength(1)
    expect(repo.search('nothing')).toHaveLength(0)
  })

  it('treats % and _ as literal characters in a search', () => {
    repo.create({ title: '100% sure', url: 'https://a.com/100%25' })
    repo.create({ title: 'Plain', url: 'https://b.com' })
    expect(repo.search('100%')).toHaveLength(1)
  })

  it('finds a duplicate by url', () => {
    repo.create({ title: 'A', url: 'https://a.com' })
    expect(repo.findDuplicate('https://a.com')?.title).toBe('A')
    expect(repo.findDuplicate('https://b.com')).toBeNull()
  })

  it('clears every bookmark and reports the number of removed rows', () => {
    repo.create({ title: 'A', url: 'https://a.com' })
    repo.create({ title: 'B', url: 'https://b.com' })
    expect(repo.clear()).toBe(2)
    expect(repo.count()).toBe(0)
  })

  it('bulk inserts bookmarks', () => {
    const inserted = repo.insertMany([
      { title: 'A', url: 'https://a.com' },
      { title: 'B', url: 'https://b.com' }
    ])
    expect(inserted).toBe(2)
    expect(repo.count()).toBe(2)
  })
})
