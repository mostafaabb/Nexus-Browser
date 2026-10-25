import { NexusApiError } from '@shared/contracts/api'

/**
 * Access to the privileged bridge. The preload script always installs this
 * object before the renderer runs; the guard only produces a readable error
 * instead of a `TypeError` when the application is misconfigured.
 */
export const nexus = window.nexus

/**
 * Reads a property from an unknown value without relying on its prototype.
 *
 * Errors raised in the preload script cross the context bridge, which does not
 * preserve custom prototypes or own properties. Duck typing therefore is the
 * only reliable way to inspect them in the renderer.
 */
function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as Record<string, unknown>)[key]
}

/** Extracts a human readable message from an unknown error value. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'string' && error) return error
  const message = readProperty(error, 'message')
  if (typeof message === 'string' && message) return message
  const code = readProperty(error, 'code')
  if (typeof code === 'string' && code) return code
  return 'Something went wrong.'
}

/** True when the error was caused by an aborted operation. */
export function isAbortError(error: unknown): boolean {
  const code = readProperty(error, 'code')
  if (code === 'E_AI_REQUEST_CANCELLED') return true
  return error instanceof NexusApiError && error.code === 'E_AI_REQUEST_CANCELLED'
}
