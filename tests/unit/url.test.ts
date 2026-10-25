import { describe, expect, it } from 'vitest'
import {
  formatUrlForDisplay,
  getOrigin,
  getOriginHost,
  isBlockedScheme,
  isDangerousUrl,
  isInternalUrl,
  isWebUrl,
  normalizeUrl,
  resolveDestination,
  resolveNavigationInput
} from '@shared/navigation/url'

describe('resolveNavigationInput', () => {
  it('treats a fully qualified https URL as a URL', () => {
    const intent = resolveNavigationInput('https://example.com/docs?a=1')
    expect(intent).toEqual({ kind: 'url', url: 'https://example.com/docs?a=1' })
  })

  it('adds a trailing slash to a bare origin', () => {
    const intent = resolveNavigationInput('https://example.com')
    expect(intent.kind).toBe('url')
    if (intent.kind === 'url') expect(intent.url).toBe('https://example.com/')
  })

  it('upgrades a bare host to https', () => {
    const intent = resolveNavigationInput('example.com')
    expect(intent).toEqual({ kind: 'url', url: 'https://example.com/' })
  })

  it('keeps a bare host with a path', () => {
    const intent = resolveNavigationInput('example.com/a/b')
    expect(intent).toEqual({ kind: 'url', url: 'https://example.com/a/b' })
  })

  it('keeps a bare host with a query string', () => {
    const intent = resolveNavigationInput('example.com/search?q=1')
    expect(intent).toEqual({ kind: 'url', url: 'https://example.com/search?q=1' })
  })

  it('uses https for a host with an explicit port', () => {
    const intent = resolveNavigationInput('example.com:8443/path')
    expect(intent).toEqual({ kind: 'url', url: 'https://example.com:8443/path' })
  })

  it('treats text with spaces as a search query', () => {
    const intent = resolveNavigationInput('how to bake bread')
    expect(intent).toEqual({ kind: 'search', query: 'how to bake bread' })
  })

  it('treats a single word that is not a host as a search query', () => {
    const intent = resolveNavigationInput('bread')
    expect(intent).toEqual({ kind: 'search', query: 'bread' })
  })

  it('accepts localhost with a port', () => {
    const intent = resolveNavigationInput('localhost:5173')
    expect(intent).toEqual({ kind: 'url', url: 'http://localhost:5173/' })
  })

  it('accepts 127.0.0.1 with a port', () => {
    const intent = resolveNavigationInput('127.0.0.1:8080/path')
    expect(intent).toEqual({ kind: 'url', url: 'http://127.0.0.1:8080/path' })
  })

  it('rejects an empty address', () => {
    expect(resolveNavigationInput('   ')).toEqual({ kind: 'invalid', reason: 'Empty address.' })
  })

  it('rejects control characters', () => {
    const intent = resolveNavigationInput('https://exa\u0000mple.com')
    expect(intent.kind).toBe('invalid')
  })

  it('rejects the javascript scheme', () => {
    const intent = resolveNavigationInput('javascript:alert(1)')
    expect(intent.kind).toBe('invalid')
    if (intent.kind === 'invalid') expect(intent.reason).toContain('javascript')
  })

  it('rejects the file scheme', () => {
    expect(resolveNavigationInput('file:///C:/Windows/System32/cmd.exe').kind).toBe('invalid')
  })

  it('rejects the data scheme', () => {
    expect(resolveNavigationInput('data:text/html,<h1>x</h1>').kind).toBe('invalid')
  })

  it('rejects an unknown scheme', () => {
    const intent = resolveNavigationInput('nexus-internal://thing')
    expect(intent.kind).toBe('invalid')
    if (intent.kind === 'invalid') expect(intent.reason).toContain('not supported')
  })

  it('does not treat a host with a trailing dot as a URL', () => {
    // `example.com.` does not match the host pattern, so it becomes a search.
    expect(resolveNavigationInput('example.com.').kind).toBe('search')
  })
})

describe('isDangerousUrl', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>',
    'file:///c:/windows',
    'vbscript:msgbox',
    'about:blank',
    'chrome://settings',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
    'ws://example.com/socket',
    'ms-msdt:/id',
    'intent://scan/#Intent;scheme=zxing;end'
  ])('flags %s as dangerous', (url) => {
    expect(isDangerousUrl(url)).toBe(true)
  })

  it.each(['https://example.com', 'http://example.com/a?b=c#d', 'https://localhost:3000'])(
    'allows %s',
    (url) => {
      expect(isDangerousUrl(url)).toBe(false)
    }
  )

  it('flags an empty string', () => {
    expect(isDangerousUrl('')).toBe(true)
  })

  it('flags a string with control characters', () => {
    expect(isDangerousUrl('https://example.com/\u0007')).toBe(true)
  })

  it('rejects additional schemes that are not explicitly allowed', () => {
    expect(isDangerousUrl('mailto:someone@example.com')).toBe(true)
    expect(isDangerousUrl('mailto:someone@example.com', ['mailto:'])).toBe(false)
  })

  it('never allows a blocked scheme through the additional scheme list', () => {
    expect(isDangerousUrl('javascript:alert(1)', ['mailto:'])).toBe(true)
    expect(isDangerousUrl('file:///c:/windows', ['mailto:'])).toBe(true)
  })

  it('still rejects control characters in an additional scheme', () => {
    expect(isDangerousUrl('mailto:a@b.com\u0007', ['mailto:'])).toBe(true)
  })
})

describe('isBlockedScheme', () => {
  it('detects blocked schemes case insensitively', () => {
    expect(isBlockedScheme('JAVASCRIPT:alert(1)')).toBe(true)
    expect(isBlockedScheme('File:///c:/')).toBe(true)
  })

  it('does not flag http', () => {
    expect(isBlockedScheme('https://example.com')).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('returns null for a dangerous URL', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
  })

  it('returns null for a relative path', () => {
    expect(normalizeUrl('/relative/path')).toBeNull()
  })

  it('normalizes an http URL', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/')
  })
})

describe('resolveDestination', () => {
  it('returns the URL for a URL input', () => {
    expect(resolveDestination('https://example.com')).toEqual({ url: 'https://example.com/' })
  })

  it('builds a search URL for a query', () => {
    const result = resolveDestination('hello world')
    expect(result).toHaveProperty('url')
    if ('url' in result) {
      expect(result.url).toContain('duckduckgo.com')
      expect(result.url).toContain('hello%20world')
    }
  })

  it('honours a configured search engine', () => {
    const result = resolveDestination('hello', { searchEngineId: 'brave' })
    if ('url' in result) expect(result.url).toContain('search.brave.com')
  })

  it('reports an error for an invalid input', () => {
    expect(resolveDestination('javascript:alert(1)')).toHaveProperty('error')
  })
})

describe('url helpers', () => {
  it('extracts the host', () => {
    expect(getOriginHost('https://Example.COM/a')).toBe('example.com')
  })

  it('returns null for a host of an invalid URL', () => {
    expect(getOriginHost('not a url')).toBeNull()
  })

  it('returns the origin', () => {
    expect(getOrigin('https://example.com/a?b=c')).toBe('https://example.com')
  })

  it('returns null for the origin of a non http URL', () => {
    expect(getOrigin('ftp://example.com')).toBeNull()
  })

  it('detects web URLs', () => {
    expect(isWebUrl('https://example.com')).toBe(true)
    expect(isWebUrl('nexus://start')).toBe(false)
  })

  it('detects internal URLs', () => {
    expect(isInternalUrl('nexus://start')).toBe(true)
    expect(isInternalUrl('NEXUS://BOOKMARKS')).toBe(true)
    expect(isInternalUrl('https://example.com')).toBe(false)
  })

  it('formats a URL for the address bar', () => {
    expect(formatUrlForDisplay('https://example.com/a/b?c=1')).toBe('example.com/a/b?c=1')
    expect(formatUrlForDisplay('https://example.com/')).toBe('example.com')
  })

  it('returns the raw string when the URL cannot be parsed', () => {
    expect(formatUrlForDisplay('nonsense')).toBe('nonsense')
  })
})
