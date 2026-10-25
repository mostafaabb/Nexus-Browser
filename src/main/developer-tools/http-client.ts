import { ERROR_CODES, AppError } from '@shared/errors'
import { MAX_HTTP_RESPONSE_BYTES } from '@shared/constants/app'
import type {
  HeaderEntry,
  HttpMethod,
  HttpRequestPayload,
  HttpResponsePayload,
  QueryParam
} from '@shared/types'
import { createId } from '../utils/id'

export interface HttpClientOptions {
  /** Maximum number of milliseconds a request may take. */
  defaultTimeoutMs: number
}

export interface HttpSendResult {
  requestId: string
  response: HttpResponsePayload | null
  error: string | null
  /** Wall-clock duration of the attempt, also reported for failures. */
  durationMs: number
}

/**
 * A small HTTP client used by the developer API tester.
 *
 * Security notes:
 * - Only `http:` and `https:` destinations are reachable.
 * - No browser cookies, stored passwords or AI credentials are attached.
 * - The client runs in the main process but is only reachable through the
 *   dedicated developer-tools IPC channel, never from website content.
 */
export class HttpClient {
  private readonly controllers = new Map<string, AbortController>()
  private readonly options: HttpClientOptions

  constructor(options: HttpClientOptions) {
    this.options = options
  }

  cancel(requestId: string): boolean {
    const controller = this.controllers.get(requestId)
    if (!controller) return false
    controller.abort()
    this.controllers.delete(requestId)
    return true
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  async send(payload: HttpRequestPayload): Promise<HttpSendResult> {
    const requestId = createId('req')
    const url = buildUrl(payload.url, payload.query)
    if (!url) {
      return {
        requestId,
        response: null,
        error: 'The request URL is not a valid http(s) address.',
        durationMs: 0
      }
    }

    const headers = buildHeaders(payload.headers)
    const body = buildBody(payload)
    const controller = new AbortController()
    this.controllers.set(requestId, controller)

    const timeout = setTimeout(
      () => controller.abort(),
      payload.timeoutMs || this.options.defaultTimeoutMs
    )
    const started = Date.now()

    try {
      const response = await fetch(url, {
        method: payload.method,
        headers,
        body: payload.method === 'GET' || payload.method === 'HEAD' ? undefined : body,
        signal: controller.signal,
        redirect: 'follow'
      })

      const text = await readLimited(response)
      const durationMs = Date.now() - started
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const contentType = response.headers.get('content-type')
      let json: unknown = null
      let bodyIsJson = false
      if (contentType?.includes('json')) {
        try {
          json = JSON.parse(text)
          bodyIsJson = true
        } catch {
          json = null
        }
      } else if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          json = JSON.parse(text)
          bodyIsJson = true
        } catch {
          json = null
        }
      }

      return {
        requestId,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: text,
          bodyIsJson,
          json,
          durationMs,
          sizeBytes: Buffer.byteLength(text, 'utf8'),
          contentType
        },
        error: null,
        durationMs
      }
    } catch (error) {
      const durationMs = Date.now() - started
      const message = describeError(error)
      return { requestId, response: null, error: message, durationMs }
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(requestId)
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'The request was cancelled or timed out.'
    const cause = (error as { cause?: { code?: string } }).cause
    if (cause?.code === 'ENOTFOUND') return 'The host could not be found (DNS failure).'
    if (cause?.code === 'ECONNREFUSED') return 'The connection was refused by the host.'
    if (cause?.code === 'ECONNRESET') return 'The connection was reset by the host.'
    return error.message
  }
  return 'The request failed.'
}

export function buildUrl(base: string, query: QueryParam[]): string | null {
  let url: URL
  try {
    url = new URL(base.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const params = new URLSearchParams()
  for (const entry of query) {
    if (!entry.enabled || !entry.key) continue
    params.append(entry.key, entry.value)
  }
  const serialized = params.toString()
  if (serialized) {
    url.search = url.search ? `${url.search}&${serialized}` : serialized
  }
  return url.toString()
}

export function buildHeaders(entries: HeaderEntry[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const entry of entries) {
    if (!entry.enabled || !entry.key) continue
    const key = entry.key.trim()
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) continue
    headers[key] = entry.value
  }
  return headers
}

export function buildBody(payload: HttpRequestPayload): string | undefined {
  if (payload.method === 'GET' || payload.method === 'HEAD') return undefined
  if (payload.bodyType === 'none') return undefined
  if (payload.bodyType === 'form') {
    const params = new URLSearchParams()
    for (const pair of payload.body.split('\n')) {
      const index = pair.indexOf('=')
      if (index <= 0) continue
      params.append(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
    return params.toString()
  }
  if (payload.bodyType === 'json') {
    try {
      JSON.parse(payload.body)
    } catch {
      throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'The JSON request body is not valid JSON.')
    }
  }
  return payload.body
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return await response.text()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_HTTP_RESPONSE_BYTES) {
      await reader.cancel()
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'The response exceeded the maximum size that Nexus buffers.'
      )
    }
    chunks.push(value)
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  return buffer.toString('utf8')
}

/** Returns true when the target points at a loopback or private network host. */
export function isLocalTarget(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.localhost'))
      return true
    if (/^127\./.test(hostname)) return true
    if (/^10\./.test(hostname)) return true
    if (/^192\.168\./.test(hostname)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
    if (/^169\.254\./.test(hostname)) return true
    return false
  } catch {
    return false
  }
}

export type { HttpMethod }
