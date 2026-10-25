import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'

let directory: string
let service: DatabaseService
let repo: DatabaseService['repositories']['workspaces']

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-workspaces-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
  repo = service.repositories.workspaces
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('workspaces repository', () => {
  it('creates a workspace with defaults', () => {
    const workspace = repo.create({ name: 'Research' })
    expect(workspace.id).toBeTruthy()
    expect(workspace.name).toBe('Research')
    expect(workspace.layout).toBe('single')
    expect(workspace.isDefault).toBe(false)
    expect(workspace.position).toBe(0)
  })

  it('stores the supplied layout and colour', () => {
    const workspace = repo.create({ name: 'Split', layout: 'split-vertical', color: '#06b6d4' })
    expect(workspace.layout).toBe('split-vertical')
    expect(workspace.color).toBe('#06b6d4')
  })

  it('updates a workspace', () => {
    const workspace = repo.create({ name: 'Old' })
    const updated = repo.update(workspace.id, { name: 'New' })
    expect(updated?.name).toBe('New')
    expect(updated?.icon).toBe(workspace.icon)
  })

  it('returns null when updating an unknown workspace', () => {
    expect(repo.update('nope', { name: 'x' })).toBeNull()
  })

  it('deletes a workspace', () => {
    const workspace = repo.create({ name: 'Temp' })
    expect(repo.delete(workspace.id)).toBe(true)
    expect(repo.list()).toHaveLength(0)
  })

  it('allows only one default workspace', () => {
    const a = repo.create({ name: 'A' })
    const b = repo.create({ name: 'B' })
    repo.setDefault(a.id)
    repo.setDefault(b.id)
    expect(repo.getDefault()?.id).toBe(b.id)
    expect(repo.list().filter((workspace) => workspace.isDefault)).toHaveLength(1)
  })

  it('reorders workspaces', () => {
    const a = repo.create({ name: 'A' })
    const b = repo.create({ name: 'B' })
    repo.reorder([b.id, a.id])
    expect(repo.list().map((workspace) => workspace.name)).toEqual(['B', 'A'])
  })
})

describe('workspace tabs', () => {
  it('stores and lists tabs of a workspace', () => {
    const workspace = repo.create({ name: 'Research' })
    repo.addTab({
      workspaceId: workspace.id,
      tabId: 'tab-1',
      url: 'https://example.com',
      title: 'Example'
    })
    const tabs = repo.listTabs(workspace.id)
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.tabId).toBe('tab-1')
    expect(repo.countTabs(workspace.id)).toBe(1)
  })

  it('updates a tab', () => {
    const workspace = repo.create({ name: 'Research' })
    repo.addTab({ workspaceId: workspace.id, tabId: 'tab-1' })
    repo.updateTab('tab-1', { title: 'Renamed', pinned: true })
    const [tab] = repo.listTabs(workspace.id)
    expect(tab?.title).toBe('Renamed')
    expect(tab?.pinned).toBe(true)
  })

  it('moves a tab to another workspace', () => {
    const source = repo.create({ name: 'Source' })
    const target = repo.create({ name: 'Target' })
    repo.addTab({ workspaceId: source.id, tabId: 'tab-1' })
    repo.moveTab('tab-1', target.id)
    expect(repo.countTabs(source.id)).toBe(0)
    expect(repo.countTabs(target.id)).toBe(1)
  })

  it('removes a tab', () => {
    const workspace = repo.create({ name: 'Research' })
    repo.addTab({ workspaceId: workspace.id, tabId: 'tab-1' })
    repo.removeTab('tab-1')
    expect(repo.countTabs(workspace.id)).toBe(0)
  })
})

describe('tab groups', () => {
  it('creates a group inside a workspace', () => {
    const workspace = repo.create({ name: 'Research' })
    const group = repo.createGroup({ workspaceId: workspace.id, name: 'Docs', color: '#f59e0b' })
    expect(group.name).toBe('Docs')
    expect(group.collapsed).toBe(false)
    expect(repo.listGroups(workspace.id)).toHaveLength(1)
  })

  it('updates and deletes a group', () => {
    const workspace = repo.create({ name: 'Research' })
    const group = repo.createGroup({ workspaceId: workspace.id, name: 'Docs', color: '#f59e0b' })
    const updated = repo.updateGroup(group.id, { name: 'Guides', collapsed: true })
    expect(updated?.name).toBe('Guides')
    expect(updated?.collapsed).toBe(true)
    expect(repo.deleteGroup(group.id)).toBe(true)
    expect(repo.listGroups(workspace.id)).toHaveLength(0)
  })
})
