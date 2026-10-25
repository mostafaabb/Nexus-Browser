import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'

let directory: string
let service: DatabaseService

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-settings-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('settings repository', () => {
  it('returns the defaults when nothing was stored', () => {
    const settings = service.repositories.settings.getAll()
    expect(settings.theme).toBe('dark')
    expect(settings.accent).toBe('violet')
    expect(settings.recordHistory).toBe(true)
    expect(settings.onboardingCompleted).toBe(false)
  })

  it('persists a single value', () => {
    service.repositories.settings.set('theme', 'light')
    expect(service.repositories.settings.getAll().theme).toBe('light')
  })

  it('persists several values at once', () => {
    service.repositories.settings.setMany({ theme: 'light', accent: 'cyan', editorFontSize: 16 })
    const settings = service.repositories.settings.getAll()
    expect(settings.theme).toBe('light')
    expect(settings.accent).toBe('cyan')
    expect(settings.editorFontSize).toBe(16)
  })

  it('ignores stored values that are not part of the settings contract', () => {
    service.repositories.settings.setRaw('unknownKey', 'value')
    expect(() => service.repositories.settings.getAll()).not.toThrow()
    expect(service.repositories.settings.getAll().theme).toBe('dark')
  })

  it('ignores malformed stored values', () => {
    service.db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'theme',
      '{not json',
      Date.now()
    ])
    expect(service.repositories.settings.getAll().theme).toBe('dark')
  })

  it('stores and reads raw values', () => {
    service.repositories.settings.setRaw('ai.provider', { providerId: 'mock' })
    expect(service.repositories.settings.getRaw<{ providerId: string }>('ai.provider')).toEqual({
      providerId: 'mock'
    })
  })

  it('returns null for a missing raw value', () => {
    expect(service.repositories.settings.getRaw('does.not.exist')).toBeNull()
  })

  it('resets to the defaults', () => {
    service.repositories.settings.setMany({ theme: 'light', accent: 'amber' })
    const settings = service.repositories.settings.reset()
    expect(settings.theme).toBe('dark')
    expect(settings.accent).toBe('violet')
  })
})

describe('permissions repository', () => {
  it('stores a decision per origin and permission', () => {
    const repo = service.repositories.permissions
    repo.set('https://example.com', 'notifications', 'allow')
    repo.set('https://example.com', 'geolocation', 'deny')
    const decisions = repo.list()
    expect(decisions).toHaveLength(2)
    expect(decisions.find((item) => item.permission === 'notifications')?.decision).toBe('allow')
  })

  it('overwrites an existing decision', () => {
    const repo = service.repositories.permissions
    repo.set('https://example.com', 'notifications', 'allow')
    repo.set('https://example.com', 'notifications', 'deny')
    expect(repo.list()).toHaveLength(1)
    expect(repo.list()[0]?.decision).toBe('deny')
  })

  it('resets every decision', () => {
    const repo = service.repositories.permissions
    repo.set('https://example.com', 'notifications', 'allow')
    repo.reset()
    expect(repo.list()).toHaveLength(0)
  })
})
