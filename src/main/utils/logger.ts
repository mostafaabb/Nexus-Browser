/**
 * Small logging helper. Log output never contains API keys, page contents or
 * credential material — callers pass structured, non-sensitive fields only.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const SENSITIVE_KEY = /(key|token|secret|password|authorization|cookie|apikey)/i

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value
  }
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(val)
    }
    return out
  }
  return value
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  child(scope: string): Logger
}

export function createLogger(scope: string, level: Level = 'info'): Logger {
  const threshold = LEVELS[level]

  const write = (logLevel: Level, message: string, meta?: Record<string, unknown>): void => {
    if (LEVELS[logLevel] < threshold) return
    const payload = meta ? (sanitize(meta) as Record<string, unknown>) : undefined
    const line = `[${scope}] ${message}`
    if (logLevel === 'error') {
      console.error(line, payload ?? '')
    } else if (logLevel === 'warn') {
      console.warn(line, payload ?? '')
    } else {
      console.log(line, payload ?? '')
    }
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    child: (childScope) => createLogger(`${scope}:${childScope}`, level)
  }
}
