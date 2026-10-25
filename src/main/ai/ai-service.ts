import { ERROR_CODES, AppError } from '@shared/errors'
import type {
  AiCompletionResult,
  AiContextItem,
  AiConversation,
  AiMessage,
  AiProviderConfig,
  AiProviderId
} from '@shared/types'
import type { DatabaseService } from '../database'
import type { CredentialStore } from '../security/credential-store'
import { MockProvider } from './providers/mock-provider'
import { OpenAiCompatibleProvider } from './providers/openai-compatible-provider'
import type { AiProvider, ProviderMessage, ProviderUsage } from './providers/types'
import { SYSTEM_PROMPT, buildUserPrompt, getAiAction } from './prompts'

const CONFIG_KEY = 'ai.provider.config'
const API_KEY_SECRET = 'ai.provider.apiKey'

export const DEFAULT_PROVIDER_CONFIG: AiProviderConfig = {
  providerId: 'mock',
  displayName: 'Nexus Mock (offline)',
  endpoint: '',
  model: 'nexus-mock-1',
  hasApiKey: false,
  timeoutMs: 60_000,
  temperature: null,
  maxTokens: null,
  stream: true,
  extraHeaders: {}
}

export interface AiStreamEvent {
  type: 'chunk' | 'done' | 'error' | 'cancelled'
  conversationId: string
  messageId: string
  delta?: string
  message?: string
  usage?: ProviderUsage | null
}

export interface AiServiceOptions {
  database: DatabaseService
  credentials: CredentialStore
}

interface StoredProviderConfig {
  providerId: AiProviderId
  displayName: string
  endpoint: string
  model: string
  timeoutMs: number
  temperature: number | null
  maxTokens: number | null
  stream: boolean
  extraHeaders: Record<string, string>
}

/** Coordinates AI conversations, providers and persistence. */
export class AiService {
  private readonly controllers = new Map<string, AbortController>()
  private readonly options: AiServiceOptions

  constructor(options: AiServiceOptions) {
    this.options = options
  }

  get config(): AiProviderConfig {
    const stored =
      this.options.database.repositories.settings.getRaw<StoredProviderConfig>(CONFIG_KEY)
    const base: AiProviderConfig = stored
      ? {
          providerId: stored.providerId,
          displayName: stored.displayName,
          endpoint: stored.endpoint,
          model: stored.model,
          hasApiKey: false,
          timeoutMs: stored.timeoutMs,
          temperature: stored.temperature,
          maxTokens: stored.maxTokens,
          stream: stored.stream,
          extraHeaders: stored.extraHeaders ?? {}
        }
      : { ...DEFAULT_PROVIDER_CONFIG }

    base.hasApiKey = this.options.credentials.has(API_KEY_SECRET)
    return base
  }

  saveConfig(
    patch: Partial<AiProviderConfig>,
    apiKey?: string | null
  ): { config: AiProviderConfig; warning: string | null } {
    const current = this.config
    const next: AiProviderConfig = {
      ...current,
      ...patch,
      extraHeaders: patch.extraHeaders ?? current.extraHeaders
    }
    next.providerId = next.providerId === 'openai-compatible' ? 'openai-compatible' : 'mock'
    if (next.providerId === 'mock') {
      next.displayName = DEFAULT_PROVIDER_CONFIG.displayName
      next.endpoint = ''
      next.model = DEFAULT_PROVIDER_CONFIG.model
    }

    const stored: StoredProviderConfig = {
      providerId: next.providerId,
      displayName: next.displayName,
      endpoint: next.endpoint,
      model: next.model,
      timeoutMs: next.timeoutMs,
      temperature: next.temperature,
      maxTokens: next.maxTokens,
      stream: next.stream,
      extraHeaders: next.extraHeaders
    }
    this.options.database.repositories.settings.setRaw(CONFIG_KEY, stored)

    let warning: string | null = null
    if (apiKey !== undefined && apiKey !== null) {
      if (apiKey.trim() === '') {
        this.options.credentials.delete(API_KEY_SECRET)
      } else {
        try {
          this.options.credentials.set(API_KEY_SECRET, apiKey.trim())
        } catch (error) {
          warning =
            error instanceof AppError
              ? error.message
              : 'The credential could not be stored securely and was kept for this session only.'
        }
      }
    }

    return { config: this.config, warning }
  }

  clearApiKey(): void {
    this.options.credentials.delete(API_KEY_SECRET)
  }

  /** Builds the provider instance for the current configuration. */
  createProvider(): AiProvider {
    const config = this.config
    if (config.providerId === 'mock') return new MockProvider()

    const apiKey = this.options.credentials.get(API_KEY_SECRET)
    if (!apiKey) {
      throw new AppError(
        ERROR_CODES.AI_NOT_CONFIGURED,
        'No API key is stored for this provider. Add one in Settings → AI.'
      )
    }
    if (!config.endpoint) {
      throw new AppError(
        ERROR_CODES.AI_NOT_CONFIGURED,
        'No endpoint is configured. Add the API endpoint in Settings → AI.'
      )
    }
    return new OpenAiCompatibleProvider({
      endpoint: config.endpoint,
      apiKey,
      extraHeaders: config.extraHeaders
    })
  }

  async testConnection(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
    const started = Date.now()
    try {
      const provider = this.createProvider()
      const result = await provider.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Reply with the single word: ready' }
        ],
        model: this.config.model,
        temperature: null,
        maxTokens: 16,
        timeoutMs: Math.min(this.config.timeoutMs, 20_000)
      })
      return {
        ok: true,
        message: `Connection succeeded.${result.content ? ` Provider replied: ${result.content.slice(0, 80)}` : ''}`,
        latencyMs: Date.now() - started
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The connection test failed.',
        latencyMs: Date.now() - started
      }
    }
  }

  async send(
    input: {
      conversationId: string | null
      prompt: string
      actionId: string | null
      context: AiContextItem[]
      persist: boolean
    },
    emit: (event: AiStreamEvent) => void
  ): Promise<AiCompletionResult> {
    const repo = this.options.database.repositories.ai
    const config = this.config

    const action = input.actionId ? getAiAction(input.actionId) : undefined
    const promptText = action ? action.prompt : input.prompt
    const userContent = buildUserPrompt(promptText, input.context)

    let conversationId = input.conversationId
    if (!conversationId) {
      const title = (input.prompt || action?.label || 'New conversation').slice(0, 80)
      const conversation = repo.createConversation({
        title,
        providerId: config.providerId,
        model: config.model,
        persisted: input.persist
      })
      conversationId = conversation.id
    }

    const userMessage = repo.addMessage({
      conversationId,
      role: 'user',
      content: userContent,
      contextLabels: input.context.map((item) => item.label)
    })

    const assistantMessage = repo.addMessage({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })

    const history = repo
      .listMessages(conversationId)
      .filter((message) => message.id !== assistantMessage.id && message.status !== 'error')
      .slice(-12)
      .map<ProviderMessage>((message) => ({
        role:
          message.role === 'assistant'
            ? 'assistant'
            : message.role === 'system'
              ? 'system'
              : 'user',
        content: message.content
      }))

    const provider = this.createProvider()
    const controller = new AbortController()
    this.controllers.set(conversationId, controller)

    let streamed = ''
    try {
      const result = await provider.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: userContent }
        ],
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
        signal: controller.signal,
        onChunk:
          config.stream && provider.supportsStreaming
            ? (delta) => {
                streamed += delta
                emit({
                  type: 'chunk',
                  conversationId: conversationId!,
                  messageId: assistantMessage.id,
                  delta
                })
              }
            : undefined
      })

      const content = result.content || streamed
      repo.updateMessage(assistantMessage.id, {
        content,
        status: 'complete',
        error: null,
        usage: result.usage
      })
      emit({
        type: 'done',
        conversationId,
        messageId: assistantMessage.id,
        usage: result.usage ?? null
      })
      return {
        conversationId,
        messageId: assistantMessage.id,
        content,
        usage: result.usage ?? null
      }
    } catch (error) {
      const cancelled = error instanceof AppError && error.code === ERROR_CODES.AI_REQUEST_CANCELLED
      if (cancelled) {
        repo.updateMessage(assistantMessage.id, {
          content: streamed,
          status: 'cancelled',
          error: null
        })
        emit({ type: 'cancelled', conversationId, messageId: assistantMessage.id })
      } else {
        const message = error instanceof Error ? error.message : 'The AI request failed.'
        repo.updateMessage(assistantMessage.id, {
          content: streamed,
          status: 'error',
          error: message
        })
        emit({ type: 'error', conversationId, messageId: assistantMessage.id, message })
      }
      throw error instanceof AppError
        ? error
        : new AppError(ERROR_CODES.AI_PROVIDER_ERROR, 'The AI request failed.')
    } finally {
      this.controllers.delete(conversationId)
      void userMessage
    }
  }

  stop(conversationId: string): boolean {
    const controller = this.controllers.get(conversationId)
    if (!controller) return false
    controller.abort()
    this.controllers.delete(conversationId)
    return true
  }

  /* ------------------------------------------------------- conversations --- */

  listConversations(): AiConversation[] {
    return this.options.database.repositories.ai.listConversations()
  }

  getConversation(id: string): AiConversation | null {
    return this.options.database.repositories.ai.getConversation(id)
  }

  listMessages(conversationId: string): AiMessage[] {
    return this.options.database.repositories.ai.listMessages(conversationId)
  }

  createConversation(input: {
    title?: string
    providerId?: string
    model?: string
    persisted?: boolean
  }): AiConversation {
    const config = this.config
    return this.options.database.repositories.ai.createConversation({
      title: input.title ?? 'New conversation',
      providerId: input.providerId ?? config.providerId,
      model: input.model ?? config.model,
      persisted: input.persisted ?? true
    })
  }

  renameConversation(id: string, title: string): AiConversation | null {
    return this.options.database.repositories.ai.renameConversation(id, title)
  }

  deleteConversation(id: string): boolean {
    return this.options.database.repositories.ai.deleteConversation(id)
  }

  clearConversation(id: string): number {
    return this.options.database.repositories.ai.clearConversation(id)
  }

  stopAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }
}
