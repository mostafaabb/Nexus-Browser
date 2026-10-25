import { createInterface } from 'node:readline'
import { ERROR_CODES, AppError } from '@shared/errors'
import type { AiProvider, CompletionRequest, ProviderResult } from './types'

interface OpenAiStreamChunk {
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  error?: { message?: string }
}

/**
 * Adapter for any service that speaks the OpenAI `/chat/completions` protocol.
 *
 * The endpoint, model and credentials are supplied by the user; no key is
 * bundled with the application.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible'
  readonly displayName = 'OpenAI-compatible API'
  readonly requiresApiKey = true
  readonly supportsStreaming = true

  constructor(
    private readonly options: {
      endpoint: string
      apiKey: string
      extraHeaders: Record<string, string>
    }
  ) {}

  private buildUrl(): string {
    const base = this.options.endpoint.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(base)) {
      throw new AppError(
        ERROR_CODES.INVALID_ARGUMENT,
        'The AI endpoint must be an absolute http(s) URL.'
      )
    }
    return `${base}/chat/completions`
  }

  async complete(request: CompletionRequest): Promise<ProviderResult> {
    const url = this.buildUrl()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), request.timeoutMs)

    const onExternalAbort = (): void => controller.abort(new Error('cancelled'))
    request.signal?.addEventListener('abort', onExternalAbort, { once: true })

    try {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        stream: Boolean(request.onChunk)
      }
      if (request.temperature !== null && request.temperature !== undefined) {
        body.temperature = request.temperature
      }
      if (request.maxTokens !== null && request.maxTokens !== undefined) {
        body.max_tokens = request.maxTokens
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
          ...this.options.extraHeaders
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw this.toError(response.status, text)
      }

      if (request.onChunk) {
        return await this.consumeStream(response, request.onChunk)
      }

      const json = (await response.json()) as OpenAiResponse
      if (json.error?.message) {
        throw new AppError(ERROR_CODES.AI_PROVIDER_ERROR, json.error.message)
      }
      const content = json.choices?.[0]?.message?.content ?? ''
      return {
        content,
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens
            }
          : null,
        streamed: false
      }
    } catch (error) {
      throw this.normalizeError(error)
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', onExternalAbort)
    }
  }

  private async consumeStream(
    response: Response,
    onChunk: (delta: string) => void
  ): Promise<ProviderResult> {
    if (!response.body) {
      throw new AppError(ERROR_CODES.AI_INVALID_RESPONSE, 'The provider returned an empty stream.')
    }

    let content = ''
    let usage: ProviderResult['usage'] = null

    const reader = createInterface({ input: response.body as unknown as NodeJS.ReadableStream })
    for await (const line of reader) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') break
      let parsed: OpenAiStreamChunk
      try {
        parsed = JSON.parse(data) as OpenAiStreamChunk
      } catch {
        continue
      }
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) {
        content += delta
        onChunk(delta)
      }
      if (parsed.usage) {
        usage = {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
          totalTokens: parsed.usage.total_tokens
        }
      }
    }

    return { content, usage, streamed: true }
  }

  private toError(status: number, body: string): AppError {
    const snippet = body.slice(0, 400)
    if (status === 401 || status === 403) {
      return new AppError(
        ERROR_CODES.AI_PROVIDER_ERROR,
        'The AI provider rejected the API key. Check the credentials in Settings → AI.'
      )
    }
    if (status === 429) {
      return new AppError(
        ERROR_CODES.AI_RATE_LIMITED,
        'The AI provider rate-limited the request. Try again in a moment.'
      )
    }
    if (status >= 500) {
      return new AppError(
        ERROR_CODES.AI_PROVIDER_ERROR,
        `The AI provider returned a server error (${status}). ${snippet}`
      )
    }
    return new AppError(
      ERROR_CODES.AI_PROVIDER_ERROR,
      `The AI provider returned HTTP ${status}. ${snippet}`
    )
  }

  private normalizeError(error: unknown): AppError {
    if (error instanceof AppError) return error
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('cancelled')) {
        return new AppError(ERROR_CODES.AI_REQUEST_CANCELLED, 'The request was cancelled.')
      }
      if (error.message.includes('timeout')) {
        return new AppError(ERROR_CODES.TIMEOUT, 'The AI provider did not respond in time.')
      }
      return new AppError(
        ERROR_CODES.NETWORK_ERROR,
        `Could not reach the AI provider: ${error.message}`
      )
    }
    return new AppError(ERROR_CODES.AI_PROVIDER_ERROR, 'The AI request failed.')
  }
}
