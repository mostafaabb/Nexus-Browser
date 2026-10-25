/** AI assistant types. */

export type AiProviderId = 'mock' | 'openai-compatible'

export type AiRole = 'user' | 'assistant' | 'system'

export interface AiProviderConfig {
  providerId: AiProviderId
  displayName: string
  /** Base endpoint, e.g. `https://api.openai.com/v1`. */
  endpoint: string
  model: string
  /** True when an API key is present in the OS credential store. */
  hasApiKey: boolean
  timeoutMs: number
  temperature: number | null
  maxTokens: number | null
  stream: boolean
  extraHeaders: Record<string, string>
}

export type AiContextKind = 'page' | 'selection' | 'tabs' | 'comparison' | 'pasted' | 'reader'

export interface AiContextItem {
  kind: AiContextKind
  label: string
  url: string | null
  title: string | null
  /** Text extracted from the source, truncated to the configured limit. */
  text: string
  characters: number
  truncated: boolean
}

export interface AiContextBundle {
  items: AiContextItem[]
  totalCharacters: number
}

export interface AiConversation {
  id: string
  title: string
  providerId: AiProviderId
  model: string
  createdAt: number
  updatedAt: number
  /** False when the user disabled conversation persistence. */
  persisted: boolean
  messageCount: number
}

export type AiMessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'

export interface AiMessage {
  id: string
  conversationId: string
  role: AiRole
  content: string
  createdAt: number
  status: AiMessageStatus
  /** Context attached to this specific turn (persisted as metadata only). */
  contextLabels: string[]
  error: string | null
  /** Usage information when the provider reports it. */
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null
}

export type AiActionId =
  | 'summarize'
  | 'explain'
  | 'key-facts'
  | 'notes'
  | 'study-questions'
  | 'explain-code'
  | 'summarize-docs'
  | 'summarize-tabs'
  | 'compare-pages'
  | 'research-notes'
  | 'simplify'

export interface AiActionDefinition {
  id: AiActionId
  label: string
  description: string
  prompt: string
  /** Context kinds the action needs. */
  requiresContext: AiContextKind[]
}

export interface AiStreamChunk {
  conversationId: string
  messageId: string
  delta: string
  done: boolean
}

export interface AiCompletionResult {
  conversationId: string
  messageId: string
  content: string
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null
}
