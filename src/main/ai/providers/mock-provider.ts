import { ERROR_CODES, AppError } from '@shared/errors'
import type { AiProvider, CompletionRequest, ProviderResult } from './types'

/**
 * A fully offline provider used for demos, tests and first-run experience.
 *
 * It never contacts a network service and always labels its output as a mock
 * so that simulated answers can never be mistaken for model output.
 */
export class MockProvider implements AiProvider {
  readonly id = 'mock'
  readonly displayName = 'Nexus Mock (offline)'
  readonly requiresApiKey = false
  readonly supportsStreaming = true

  async complete(request: CompletionRequest): Promise<ProviderResult> {
    const user = request.messages.filter((message) => message.role === 'user')
    const prompt = user.map((message) => message.content).join('\n\n')

    const contextCharacters = prompt.length
    const hasContext = /\[context\]/i.test(prompt) || contextCharacters > 400

    const answer = this.buildAnswer(prompt, Boolean(hasContext))

    if (!request.onChunk) {
      return { content: answer, usage: this.usage(request), streamed: false }
    }

    // The chunks are split on word boundaries but keep every character, so
    // that the streamed text is byte for byte the final answer.
    const chunks = answer.match(/\S+\s*|\s+/g) ?? [answer]
    for (const chunk of chunks) {
      if (request.signal?.aborted) {
        throw new AppError(ERROR_CODES.AI_REQUEST_CANCELLED, 'The request was cancelled.')
      }
      request.onChunk(chunk)
      await delay(18)
    }
    return { content: answer, usage: this.usage(request), streamed: true }
  }

  private usage(request: CompletionRequest): ProviderResult['usage'] {
    const promptTokens = Math.ceil(
      request.messages.reduce((total, message) => total + message.content.length, 0) / 4
    )
    const completionTokens = 120
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    }
  }

  private buildAnswer(prompt: string, hasContext: boolean): string {
    const trimmed = prompt.trim()
    const firstLine =
      trimmed
        .split('\n')
        .find((line) => line.trim().length > 0)
        ?.trim() ?? ''
    const topic = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine

    const sections: string[] = []
    sections.push(
      '> **Mock response** — generated offline by the built-in Nexus mock provider. No external AI service was contacted.'
    )
    sections.push('')
    sections.push(`**Your request:** ${topic || '(empty request)'}`)
    sections.push('')

    if (hasContext) {
      sections.push('**Context received:**')
      sections.push('')
      sections.push(
        '- The request included page context, so a real provider would analyse it here.'
      )
      sections.push('- The mock provider intentionally does not interpret the content.')
      sections.push('')
    }

    sections.push('**What a real provider would return:**')
    sections.push('')
    sections.push('1. A direct answer that addresses the request above.')
    sections.push('2. The supporting details found in the supplied context.')
    sections.push('3. Any caveats about missing or ambiguous information.')
    sections.push('')
    sections.push(
      'Configure a provider in **Settings → AI** to replace this response with real model output.'
    )
    return sections.join('\n')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
