import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '@main/database'

let directory: string
let service: DatabaseService

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'nexus-snippets-'))
  service = new DatabaseService(join(directory, 'nexus.sqlite'))
})

afterEach(() => {
  service.close()
  rmSync(directory, { recursive: true, force: true })
})

describe('snippets repository', () => {
  it('creates a snippet', () => {
    const snippet = service.repositories.snippets.save({
      title: 'Fetch helper',
      code: 'const r = await fetch(url)',
      language: 'javascript'
    })
    expect(snippet.id).toBeTruthy()
    expect(snippet.title).toBe('Fetch helper')
    expect(snippet.tags).toEqual([])
    expect(snippet.favorite).toBe(false)
    expect(service.repositories.snippets.count()).toBe(1)
  })

  it('updates an existing snippet when an id is supplied', () => {
    const snippet = service.repositories.snippets.save({
      title: 'A',
      code: 'x',
      language: 'text'
    })
    const updated = service.repositories.snippets.save({
      id: snippet.id,
      title: 'B',
      code: 'y',
      language: 'text'
    })
    expect(updated.id).toBe(snippet.id)
    expect(updated.title).toBe('B')
    expect(service.repositories.snippets.count()).toBe(1)
  })

  it('stores tags as an array', () => {
    const snippet = service.repositories.snippets.save({
      title: 'A',
      code: 'x',
      language: 'text',
      tags: ['http', 'fetch']
    })
    expect(service.repositories.snippets.get(snippet.id)?.tags).toEqual(['http', 'fetch'])
  })

  it('searches by title, description and code', () => {
    service.repositories.snippets.save({
      title: 'Alpha',
      description: 'first',
      code: 'aaa',
      language: 'text'
    })
    service.repositories.snippets.save({
      title: 'Beta',
      description: 'second',
      code: 'bbb',
      language: 'text'
    })
    expect(service.repositories.snippets.list({ search: 'alpha' })).toHaveLength(1)
    expect(service.repositories.snippets.list({ search: 'bbb' })).toHaveLength(1)
    expect(service.repositories.snippets.list({ search: 'nothing' })).toHaveLength(0)
  })

  it('filters by folder', () => {
    const folder = service.repositories.snippets.createFolder('HTTP')
    service.repositories.snippets.save({
      title: 'In folder',
      code: 'x',
      language: 'text',
      folderId: folder.id
    })
    service.repositories.snippets.save({ title: 'No folder', code: 'y', language: 'text' })
    expect(service.repositories.snippets.list({ folderId: folder.id })).toHaveLength(1)
    expect(service.repositories.snippets.list({ folderId: null })).toHaveLength(1)
  })

  it('deletes a snippet', () => {
    const snippet = service.repositories.snippets.save({ title: 'A', code: 'x', language: 'text' })
    expect(service.repositories.snippets.delete(snippet.id)).toBe(true)
    expect(service.repositories.snippets.count()).toBe(0)
  })
})

describe('ai repository', () => {
  it('creates a conversation and counts its messages', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    expect(conversation.title).toBe('New conversation')
    expect(conversation.messageCount).toBe(0)

    service.repositories.ai.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello'
    })
    expect(service.repositories.ai.getConversation(conversation.id)?.messageCount).toBe(1)
  })

  it('stores the context labels of a message', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    const message = service.repositories.ai.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Answer',
      contextLabels: ['Example page']
    })
    expect(service.repositories.ai.listMessages(conversation.id)[0]?.contextLabels).toEqual([
      'Example page'
    ])
    expect(message.contextLabels).toEqual(['Example page'])
  })

  it('updates a streamed message', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    const message = service.repositories.ai.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })
    service.repositories.ai.updateMessage(message.id, {
      content: 'Final answer',
      status: 'complete'
    })
    const stored = service.repositories.ai.listMessages(conversation.id)[0]
    expect(stored?.content).toBe('Final answer')
    expect(stored?.status).toBe('complete')
  })

  it('clears the messages of a conversation but keeps the conversation', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    service.repositories.ai.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello'
    })
    expect(service.repositories.ai.clearConversation(conversation.id)).toBe(1)
    expect(service.repositories.ai.listMessages(conversation.id)).toHaveLength(0)
    expect(service.repositories.ai.getConversation(conversation.id)).not.toBeNull()
  })

  it('deletes a conversation and its messages', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    service.repositories.ai.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello'
    })
    expect(service.repositories.ai.deleteConversation(conversation.id)).toBe(true)
    expect(service.repositories.ai.listMessages(conversation.id)).toHaveLength(0)
  })

  it('renames a conversation', () => {
    const conversation = service.repositories.ai.createConversation({
      providerId: 'mock',
      model: 'nexus-mock-1'
    })
    const renamed = service.repositories.ai.renameConversation(conversation.id, 'New title')
    expect(renamed?.title).toBe('New title')
    expect(service.repositories.ai.renameConversation('nope', 'x')).toBeNull()
  })
})
