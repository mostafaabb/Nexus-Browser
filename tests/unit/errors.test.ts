import { describe, expect, it } from 'vitest'
import { AppError, ERROR_CODES, toSerializedError } from '@shared/errors'

describe('AppError', () => {
  it('carries a machine readable code', () => {
    const error = new AppError(ERROR_CODES.NOT_FOUND, 'Nothing here.')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AppError')
    expect(error.code).toBe('E_NOT_FOUND')
    expect(error.message).toBe('Nothing here.')
  })

  it('serialises without details when there are none', () => {
    const error = new AppError(ERROR_CODES.INTERNAL, 'Boom.')
    expect(error.toJSON()).toEqual({ code: 'E_INTERNAL', message: 'Boom.' })
  })

  it('serialises the details', () => {
    const error = new AppError(ERROR_CODES.VALIDATION_ERROR, 'Bad.', { field: 'url' })
    expect(error.toJSON()).toEqual({
      code: 'E_VALIDATION_ERROR',
      message: 'Bad.',
      details: { field: 'url' }
    })
  })
})

describe('toSerializedError', () => {
  it('keeps the code of an AppError', () => {
    expect(toSerializedError(new AppError(ERROR_CODES.PERMISSION_DENIED, 'No.'))).toEqual({
      code: 'E_PERMISSION_DENIED',
      message: 'No.'
    })
  })

  it('maps a plain error to the unknown code', () => {
    expect(toSerializedError(new TypeError('nope'))).toEqual({
      code: 'E_UNKNOWN',
      message: 'nope'
    })
  })

  it('maps a thrown string to a generic message', () => {
    expect(toSerializedError('boom')).toEqual({
      code: 'E_UNKNOWN',
      message: 'An unexpected error occurred.'
    })
  })

  it('maps null to a generic message', () => {
    expect(toSerializedError(null).message).toBe('An unexpected error occurred.')
  })
})
