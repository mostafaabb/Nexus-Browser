/** Common interface implemented by every AI provider adapter. */

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface CompletionRequest {
  messages: ProviderMessage[]
  model: string
  temperature: number | null
  maxTokens: number | null
  timeoutMs: number
  signal?: AbortSignal
  /** Invoked for every streamed chunk when the provider supports streaming. */
  onChunk?: (delta: string) => void
}

export interface ProviderResult {
  content: string
  usage: ProviderUsage | null
  /** True when the response was delivered incrementally. */
  streamed: boolean
}

export interface AiProvider {
  readonly id: string
  readonly displayName: string
  readonly requiresApiKey: boolean
  /** True when the provider can deliver incremental output. */
  readonly supportsStreaming: boolean
  complete(request: CompletionRequest): Promise<ProviderResult>
}
