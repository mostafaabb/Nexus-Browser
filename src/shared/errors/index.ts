/**
 * Error codes shared between the main process and the renderer so that failures
 * can be surfaced with meaningful, non-technical messages.
 */

export const ERROR_CODES = {
  UNKNOWN: 'E_UNKNOWN',
  INVALID_ARGUMENT: 'E_INVALID_ARGUMENT',
  NOT_FOUND: 'E_NOT_FOUND',
  PERMISSION_DENIED: 'E_PERMISSION_DENIED',
  UNAUTHORIZED_SENDER: 'E_UNAUTHORIZED_SENDER',
  BLOCKED_SCHEME: 'E_BLOCKED_SCHEME',
  NAVIGATION_FAILED: 'E_NAVIGATION_FAILED',
  NETWORK_ERROR: 'E_NETWORK_ERROR',
  TIMEOUT: 'E_TIMEOUT',
  DATABASE_ERROR: 'E_DATABASE_ERROR',
  CREDENTIAL_STORE_UNAVAILABLE: 'E_CREDENTIAL_STORE_UNAVAILABLE',
  AI_NOT_CONFIGURED: 'E_AI_NOT_CONFIGURED',
  AI_PROVIDER_ERROR: 'E_AI_PROVIDER_ERROR',
  AI_REQUEST_CANCELLED: 'E_AI_REQUEST_CANCELLED',
  AI_RATE_LIMITED: 'E_AI_RATE_LIMITED',
  AI_INVALID_RESPONSE: 'E_AI_INVALID_RESPONSE',
  VALIDATION_ERROR: 'E_VALIDATION_ERROR',
  NOT_SUPPORTED: 'E_NOT_SUPPORTED',
  FILE_WRITE_ERROR: 'E_FILE_WRITE_ERROR',
  INTERNAL: 'E_INTERNAL'
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface SerializedError {
  code: ErrorCode
  message: string
  details?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  toJSON(): SerializedError {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details }
  }
}

export function toSerializedError(error: unknown): SerializedError {
  if (error instanceof AppError) return error.toJSON()
  if (error instanceof Error) {
    return { code: ERROR_CODES.UNKNOWN, message: error.message }
  }
  return { code: ERROR_CODES.UNKNOWN, message: 'An unexpected error occurred.' }
}
