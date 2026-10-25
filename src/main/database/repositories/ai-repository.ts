import type { AiConversation, AiMessage, AiMessageStatus, AiRole } from '@shared/types'
import { createId } from '../../utils/id'
import type { NexusDatabase } from '../database'

interface ConversationRow {
  id: string
  title: string
  provider_id: string
  model: string
  created_at: number
  updated_at: number
  persisted: number
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: number
  status: string
  context_labels: string
  error: string | null
  usage: string | null
}

function toConversation(row: ConversationRow, messageCount: number): AiConversation {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id as AiConversation['providerId'],
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    persisted: row.persisted === 1,
    messageCount
  }
}

function toMessage(row: MessageRow): AiMessage {
  let contextLabels: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.context_labels)
    if (Array.isArray(parsed)) {
      contextLabels = parsed.filter((label): label is string => typeof label === 'string')
    }
  } catch {
    contextLabels = []
  }
  let usage: AiMessage['usage'] = null
  if (row.usage) {
    try {
      usage = JSON.parse(row.usage) as AiMessage['usage']
    } catch {
      usage = null
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AiRole,
    content: row.content,
    createdAt: row.created_at,
    status: row.status as AiMessageStatus,
    contextLabels,
    error: row.error,
    usage
  }
}

export class AiRepository {
  constructor(private readonly db: NexusDatabase) {}

  listConversations(): AiConversation[] {
    const rows = this.db.all<ConversationRow>(
      'SELECT * FROM ai_conversations ORDER BY updated_at DESC'
    )
    return rows.map((row) =>
      toConversation(
        row,
        this.db.get<{ count: number }>(
          'SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?',
          [row.id]
        )?.count ?? 0
      )
    )
  }

  getConversation(id: string): AiConversation | null {
    const row = this.db.get<ConversationRow>('SELECT * FROM ai_conversations WHERE id = ?', [id])
    if (!row) return null
    return toConversation(
      row,
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?',
        [row.id]
      )?.count ?? 0
    )
  }

  createConversation(input: {
    title?: string
    providerId: string
    model: string
    persisted?: boolean
  }): AiConversation {
    const now = Date.now()
    const id = createId('aic')
    this.db.run(
      'INSERT INTO ai_conversations (id, title, provider_id, model, created_at, updated_at, persisted) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.title ?? 'New conversation',
        input.providerId,
        input.model,
        now,
        now,
        input.persisted === false ? 0 : 1
      ]
    )
    return this.getConversation(id)!
  }

  renameConversation(id: string, title: string): AiConversation | null {
    if (!this.getConversation(id)) return null
    this.db.run('UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?', [
      title,
      Date.now(),
      id
    ])
    return this.getConversation(id)
  }

  deleteConversation(id: string): boolean {
    return this.db.run('DELETE FROM ai_conversations WHERE id = ?', [id]).changes > 0
  }

  clearConversation(id: string): number {
    return this.db.run('DELETE FROM ai_messages WHERE conversation_id = ?', [id]).changes
  }

  listMessages(conversationId: string): AiMessage[] {
    return this.db
      .all<MessageRow>(
        'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
        [conversationId]
      )
      .map(toMessage)
  }

  addMessage(input: {
    conversationId: string
    role: AiRole
    content: string
    status?: AiMessageStatus
    contextLabels?: string[]
    error?: string | null
    usage?: AiMessage['usage']
  }): AiMessage {
    const id = createId('aim')
    const now = Date.now()
    this.db.run(
      'INSERT INTO ai_messages (id, conversation_id, role, content, created_at, status, context_labels, error, usage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.conversationId,
        input.role,
        input.content,
        now,
        input.status ?? 'complete',
        JSON.stringify(input.contextLabels ?? []),
        input.error ?? null,
        input.usage ? JSON.stringify(input.usage) : null
      ]
    )
    this.db.run('UPDATE ai_conversations SET updated_at = ? WHERE id = ?', [
      now,
      input.conversationId
    ])
    const row = this.db.get<MessageRow>('SELECT * FROM ai_messages WHERE id = ?', [id])!
    return toMessage(row)
  }

  updateMessage(
    id: string,
    patch: {
      content?: string
      status?: AiMessageStatus
      error?: string | null
      usage?: AiMessage['usage'] | null
    }
  ): AiMessage | null {
    const existing = this.db.get<MessageRow>('SELECT * FROM ai_messages WHERE id = ?', [id])
    if (!existing) return null
    this.db.run(
      'UPDATE ai_messages SET content = ?, status = ?, error = ?, usage = ? WHERE id = ?',
      [
        patch.content ?? existing.content,
        patch.status ?? existing.status,
        patch.error === undefined ? existing.error : patch.error,
        patch.usage === undefined
          ? existing.usage
          : patch.usage === null
            ? null
            : JSON.stringify(patch.usage),
        id
      ]
    )
    const row = this.db.get<MessageRow>('SELECT * FROM ai_messages WHERE id = ?', [id])!
    return toMessage(row)
  }

  clearAll(): number {
    return this.db.run('DELETE FROM ai_messages').changes
  }
}
