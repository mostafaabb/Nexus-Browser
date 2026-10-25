/**
 * Tests for the AI provider layer.
 *
 * Two properties matter here:
 *  1. The offline mock provider must never be mistaken for a real model.
 *  2. A user supplied endpoint must be validated before any key is sent.
 */

import { describe, expect, it, vi } from 'vitest'
import { MockProvider } from '@main/ai/providers/mock-provider'
import { OpenAiCompatibleProvider } from '@main/ai/providers/openai-compatible-provider'
import { AppError, ERROR_CODES } from '@shared/errors'

const request = {
  messages: [{ role: 'user' as const, content: 'Summarise this page.' }],
  model: 'nexus-mock-1',
  temperature: null,
  maxTokens: null,
  timeoutMs: 5_000
}

describe('mock provider', () => {
  it('labels every answer as a mock response', async () => {
    const provider = new MockProvider()
    const result = await provider.complete(request)
    expect(result.content).toContain('Mock response')
    expect(result.content).toContain('No external AI service was contacted')
  })

  it('never claims to have contacted a model', async () => {
    const provider = new MockProvider()
    const result = await provider.complete(request)
    expect(result.content.toLowerCase()).toContain('mock')
    expect(result.content).toContain('Configure a provider in')
  })

  it('does not require an API key', () => {
    expect(new MockProvider().requiresApiKey).toBe(false)
  })

  it('reports a usage estimate', async () => {
    const provider = new MockProvider()
    const result = await provider.complete(request)
    expect(result.usage?.totalTokens).toBeGreaterThan(0)
  })

  it('streams the answer in chunks', async () => {
    const provider = new MockProvider()
    const chunks: string[] = []
    const result = await provider.complete({
      ...request,
      onChunk: (chunk) => chunks.push(chunk)
    })
    expect(result.streamed).toBe(true)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(result.content)
  })

  it('stops streaming when the request is aborted', async () => {
    const controller = new AbortController()
    const provider = new MockProvider()
    const chunks: string[] = []
    const promise = provider.complete({
      ...request,
      signal: controller.signal,
      onChunk: (chunk) => {
        chunks.push(chunk)
        controller.abort()
      }
    })
    await expect(promise).rejects.toBeInstanceOf(AppError)
  })
})

describe('openai compatible provider', () => {
  it('rejects an endpoint that is not an absolute http(s) URL', async () => {
    const provider = new OpenAiCompatibleProvider({
      endpoint: 'file:///etc/passwd',
      apiKey: 'secret',
      extraHeaders: {}
    })
    await expect(provider.complete(request)).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_ARGUMENT
    })
  })

  it('rejects a javascript endpoint', async () => {
    const provider = new OpenAiCompatibleProvider({
      endpoint: 'javascript:alert(1)',
      apiKey: 'secret',
      extraHeaders: {}
    })
    await expect(provider.complete(request)).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_ARGUMENT
    })
  })

  it('does not send the request when the endpoint is invalid', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const provider = new OpenAiCompatibleProvider({
      endpoint: 'not-a-url',
      apiKey: 'super-secret-key',
      extraHeaders: {}
    })
    await expect(provider.complete(request)).rejects.toBeInstanceOf(AppError)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never puts the API key into the error message', async () => {
    const provider = new OpenAiCompatibleProvider({
      endpoint: 'https://api.example.com/v1',
      apiKey: 'super-secret-key',
      extraHeaders: {}
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(provider.complete(request)).rejects.toMatchObject({
      code: ERROR_CODES.NETWORK_ERROR
    })
    const message = await provider.complete(request).catch((error: Error) => error.message)
    expect(message).not.toContain('super-secret-key')
    fetchSpy.mockRestore()
  })

  it('sends the key in the authorization header only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const provider = new OpenAiCompatibleProvider({
      endpoint: 'https://api.example.com/v1',
      apiKey: 'super-secret-key',
      extraHeaders: {}
    })
    await provider.complete(request)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer super-secret-key')
    expect(String(init.body)).not.toContain('super-secret-key')
    fetchSpy.mockRestore()
  })
})
