/**
 * Security regression tests for the navigation layer.
 *
 * These tests describe the rules that the browser enforces before a URL is
 * ever handed to Chromium. A change that weakens one of them must fail here.
 */

import { describe, expect, it } from 'vitest'
import {
  ALLOWED_SCHEMES,
  BLOCKED_SCHEMES,
  isDangerousUrl,
  isInternalUrl,
  isWebUrl,
  normalizeUrl,
  resolveNavigationInput
} from '@shared/navigation/url'

describe('protocol allow list', () => {
  it('only allows http and https for websites', () => {
    expect([...ALLOWED_SCHEMES].sort()).toEqual(['http:', 'https:'])
  })

  it('blocks the classic script and local file protocols', () => {
    for (const scheme of ['javascript', 'data', 'file', 'vbscript', 'blob']) {
      expect(BLOCKED_SCHEMES.has(scheme)).toBe(true)
    }
  })

  it('blocks the internal browser protocols', () => {
    for (const scheme of ['about', 'chrome', 'chrome-extension', 'devtools', 'view-source']) {
      expect(BLOCKED_SCHEMES.has(scheme)).toBe(true)
    }
  })

  it('blocks the network and remote protocol handlers', () => {
    for (const scheme of ['ws', 'wss', 'ftp', 'ftps', 'intent', 'android-app', 'jar']) {
      expect(BLOCKED_SCHEMES.has(scheme)).toBe(true)
    }
  })

  it('blocks the Windows remote execution protocols', () => {
    for (const scheme of ['ms-msdt', 'search-ms', 'mhtml', 'resource', 'chrome-devtools']) {
      expect(BLOCKED_SCHEMES.has(scheme)).toBe(true)
    }
  })
})

describe('dangerous url detection', () => {
  it.each([
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///C:/Windows/win.ini',
    'vbscript:msgbox("x")',
    'about:blank',
    'chrome://settings/passwords',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
    'ws://localhost:9222/devtools',
    'intent://scan/#Intent;scheme=zxing;end',
    'ms-msdt:/id PCWDiagnostic',
    'search-ms:query=x'
  ])('rejects %s', (url) => {
    expect(isDangerousUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com',
    'http://example.com/path?query=1#hash',
    'https://sub.domain.example.co.uk/',
    'https://user:pass@example.com/'
  ])('accepts %s', (url) => {
    expect(isDangerousUrl(url)).toBe(false)
  })

  it('rejects a url that smuggles a scheme behind a control character', () => {
    expect(isDangerousUrl('java\u0000script:alert(1)')).toBe(true)
    expect(isDangerousUrl('https://example.com/\u0000')).toBe(true)
  })

  it('rejects a url with a newline before the scheme', () => {
    // A naive parser would treat "javascript:" as the scheme of the second line.
    expect(isDangerousUrl('https://example.com/\njavascript:alert(1)')).toBe(true)
  })
})

describe('normalisation', () => {
  it('never returns a value for a blocked scheme', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,x')).toBeNull()
    expect(normalizeUrl('file:///c:/')).toBeNull()
  })

  it('returns null for a value that is not a URL at all', () => {
    expect(normalizeUrl('hello world')).toBeNull()
    expect(normalizeUrl('/relative')).toBeNull()
  })

  it('keeps the path and query of a valid URL', () => {
    expect(normalizeUrl('https://example.com/a/b?c=d')).toBe('https://example.com/a/b?c=d')
  })
})

describe('address bar resolution', () => {
  it('never resolves a blocked scheme into a destination', () => {
    const intents = [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///c:/windows',
      'vbscript:x',
      'about:blank',
      'chrome://settings'
    ]
    for (const value of intents) {
      const intent = resolveNavigationInput(value)
      expect(intent.kind).toBe('invalid')
    }
  })

  it('treats an internal nexus url as invalid for the address bar', () => {
    // Internal pages are opened through the UI, never typed as an address.
    const intent = resolveNavigationInput('nexus://bookmarks')
    expect(intent.kind).toBe('invalid')
  })
})

describe('internal pages', () => {
  it('recognises the nexus scheme', () => {
    expect(isInternalUrl('nexus://start')).toBe(true)
    expect(isInternalUrl('nexus://settings')).toBe(true)
  })

  it('does not treat a website as an internal page', () => {
    expect(isInternalUrl('https://example.com')).toBe(false)
    expect(isInternalUrl('https://example.com/nexus://start')).toBe(false)
  })

  it('never treats an internal page as a website', () => {
    expect(isWebUrl('nexus://start')).toBe(false)
  })
})
