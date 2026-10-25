import { describe, expect, it } from 'vitest'
import {
  parsePayload,
  zAiSendRequest,
  zBookmarkRequest,
  zCreateTabRequest,
  zFindInPageRequest,
  zHistoryQueryRequest,
  zNavigateRequest,
  zSettingsPatchRequest,
  zViewLayoutRequest,
  zWorkspaceCreateRequest
} from '@shared/schemas'
import { AppError, ERROR_CODES } from '@shared/errors'

describe('parsePayload', () => {
  it('returns the parsed value for valid input', () => {
    const result = parsePayload(zNavigateRequest, { tabId: 'tab-1', url: 'https://example.com' })
    expect(result).toEqual({ tabId: 'tab-1', url: 'https://example.com' })
  })

  it('throws an AppError with a validation code for invalid input', () => {
    expect.assertions(3)
    try {
      parsePayload(zNavigateRequest, { tabId: '', url: 'https://example.com' })
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ERROR_CODES.VALIDATION_ERROR)
      expect((error as AppError).message).toContain('tabId')
    }
  })

  it('drops unknown keys instead of failing', () => {
    const result = parsePayload(zNavigateRequest, {
      tabId: 'tab-1',
      url: 'https://example.com',
      evil: true
    })
    expect(result).toEqual({ tabId: 'tab-1', url: 'https://example.com' })
  })
})

describe('zNavigateRequest', () => {
  it('rejects an empty tab id', () => {
    expect(zNavigateRequest.safeParse({ tabId: '', url: 'https://a.com' }).success).toBe(false)
  })

  it('rejects an oversized url', () => {
    expect(
      zNavigateRequest.safeParse({ tabId: 'a', url: `https://a.com/${'x'.repeat(5000)}` }).success
    ).toBe(false)
  })
})

describe('zViewLayoutRequest', () => {
  it('accepts a valid layout', () => {
    const result = zViewLayoutRequest.safeParse({
      entries: [{ tabId: 'a', x: 0, y: 0, width: 100, height: 100 }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects non finite coordinates', () => {
    const result = zViewLayoutRequest.safeParse({
      entries: [{ tabId: 'a', x: Number.NaN, y: 0, width: 100, height: 100 }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative sizes', () => {
    const result = zViewLayoutRequest.safeParse({
      entries: [{ tabId: 'a', x: 0, y: 0, width: -1, height: 100 }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than eight entries', () => {
    const entries = Array.from({ length: 9 }, (_value, index) => ({
      tabId: `tab-${index}`,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    }))
    expect(zViewLayoutRequest.safeParse({ entries }).success).toBe(false)
  })
})

describe('zCreateTabRequest', () => {
  it('accepts an empty object', () => {
    expect(zCreateTabRequest.safeParse({}).success).toBe(true)
  })

  it('rejects a non boolean activate flag', () => {
    expect(zCreateTabRequest.safeParse({ activate: 'yes' }).success).toBe(false)
  })
})

describe('zBookmarkRequest', () => {
  it('requires a title and a url', () => {
    expect(zBookmarkRequest.safeParse({ title: 'a', url: 'https://a.com' }).success).toBe(true)
    expect(zBookmarkRequest.safeParse({ title: 'a' }).success).toBe(false)
    expect(zBookmarkRequest.safeParse({ url: 'https://a.com' }).success).toBe(false)
  })

  it('accepts a null parent', () => {
    expect(
      zBookmarkRequest.safeParse({ title: 'a', url: 'https://a.com', parentId: null }).success
    ).toBe(true)
  })
})

describe('zHistoryQueryRequest', () => {
  it('rejects an unknown range', () => {
    expect(zHistoryQueryRequest.safeParse({ range: 'decade' }).success).toBe(false)
  })

  it('accepts the known ranges', () => {
    for (const range of ['all', 'hour', 'day', 'week', 'month']) {
      expect(zHistoryQueryRequest.safeParse({ range }).success).toBe(true)
    }
  })

  it('rejects a negative limit', () => {
    expect(zHistoryQueryRequest.safeParse({ limit: -1 }).success).toBe(false)
  })
})

describe('zWorkspaceCreateRequest', () => {
  it('accepts a valid workspace', () => {
    expect(zWorkspaceCreateRequest.safeParse({ name: 'Research', color: '#8b5cf6' }).success).toBe(
      true
    )
  })

  it('rejects a malformed colour', () => {
    expect(zWorkspaceCreateRequest.safeParse({ name: 'x', color: 'red' }).success).toBe(false)
    expect(zWorkspaceCreateRequest.safeParse({ name: 'x', color: '#fff' }).success).toBe(false)
  })

  it('rejects an unknown layout', () => {
    expect(zWorkspaceCreateRequest.safeParse({ name: 'x', layout: 'grid' }).success).toBe(false)
  })
})

describe('zSettingsPatchRequest', () => {
  it('accepts a partial patch', () => {
    expect(zSettingsPatchRequest.safeParse({ patch: { theme: 'dark' } }).success).toBe(true)
  })

  it('rejects an unknown theme', () => {
    expect(zSettingsPatchRequest.safeParse({ patch: { theme: 'solarized' } }).success).toBe(false)
  })

  it('drops unknown keys instead of applying them', () => {
    // Zod strips unknown keys, so an unexpected setting can never reach the
    // database.
    const parsed = parsePayload(zSettingsPatchRequest, {
      patch: { theme: 'dark', totallyUnknown: 1 }
    })
    expect(parsed.patch).toEqual({ theme: 'dark' })
  })

  it('rejects out of range values', () => {
    expect(zSettingsPatchRequest.safeParse({ patch: { editorFontSize: 2 } }).success).toBe(false)
    expect(zSettingsPatchRequest.safeParse({ patch: { aiTimeoutMs: 10 } }).success).toBe(false)
  })
})

describe('zAiSendRequest', () => {
  it('requires a non empty prompt', () => {
    expect(
      zAiSendRequest.safeParse({ prompt: '', conversationId: null, context: [] }).success
    ).toBe(false)
  })

  it('accepts a valid request', () => {
    expect(
      zAiSendRequest.safeParse({ prompt: 'hello', conversationId: null, context: [] }).success
    ).toBe(true)
  })

  it('rejects an unknown context kind', () => {
    const result = zAiSendRequest.safeParse({
      prompt: 'hello',
      conversationId: null,
      context: [
        {
          kind: 'system',
          label: 'x',
          url: null,
          title: null,
          text: 'y',
          characters: 1,
          truncated: false
        }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 32 context blocks', () => {
    const context = Array.from({ length: 33 }, () => ({
      kind: 'page',
      label: 'x',
      url: null,
      title: null,
      text: 'y',
      characters: 1,
      truncated: false
    }))
    expect(
      zAiSendRequest.safeParse({ prompt: 'hello', conversationId: null, context }).success
    ).toBe(false)
  })
})

describe('zFindInPageRequest', () => {
  it('requires the direction flags', () => {
    expect(zFindInPageRequest.safeParse({ tabId: 'a', query: 'x' }).success).toBe(false)
    expect(
      zFindInPageRequest.safeParse({ tabId: 'a', query: 'x', forward: true, findNext: false })
        .success
    ).toBe(true)
  })
})
