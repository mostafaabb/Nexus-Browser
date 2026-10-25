/**
 * Navigation input parsing.
 *
 * This module is deliberately dependency free so it can be unit tested and used
 * from both the renderer (address bar) and the main process (navigation
 * validation) without any trust assumptions.
 */

import { buildSearchUrl } from '../constants/search-engines'

export type NavigationIntent =
  | { kind: 'url'; url: string }
  | { kind: 'search'; query: string }
  | { kind: 'invalid'; reason: string }

/** Schemes that must never be navigated to from the address bar. */
export const BLOCKED_SCHEMES = new Set([
  'javascript',
  'data',
  'file',
  'vbscript',
  'blob',
  'about',
  'chrome',
  'chrome-extension',
  'devtools',
  'view-source',
  'ws',
  'wss',
  'ftp',
  'ftps',
  'intent',
  'android-app',
  'jar',
  'ms-msdt',
  'search-ms',
  'mhtml',
  'resource',
  'chrome-devtools'
])

/** Schemes that Nexus is allowed to navigate to. */
export const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

/**
 * Matches ASCII control characters.
 *
 * They are never valid inside a URL and are used to smuggle dangerous schemes
 * past naive parsers, so every address is screened for them.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS_RE = /[\u0000-\u001f\u007f]/

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
/** A dotted host name with an alphabetic top level domain (`example.com`). */
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i
/** A literal IPv4 address. */
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/
const LOCALHOST_RE = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/i

export function isBlockedScheme(url: string): boolean {
  const match = SCHEME_RE.exec(url.trim())
  if (!match?.[1]) return false
  return BLOCKED_SCHEMES.has(match[1].toLowerCase())
}

/**
 * Returns true when the URL uses a scheme Nexus refuses to navigate to.
 *
 * `additionalSchemes` lists schemes that are not navigable but are still safe
 * to hand to the operating system (for example `mailto:` when a link is
 * opened externally).
 */
export function isDangerousUrl(url: string, additionalSchemes: readonly string[] = []): boolean {
  const trimmed = url.trim()
  if (!trimmed) return true
  if (CONTROL_CHARACTERS_RE.test(trimmed)) return true
  const match = SCHEME_RE.exec(trimmed)
  if (!match?.[1]) return false
  const scheme = match[1].toLowerCase()
  if (BLOCKED_SCHEMES.has(scheme)) return true
  try {
    const parsed = new URL(trimmed)
    if (ALLOWED_SCHEMES.has(parsed.protocol)) return false
    return !additionalSchemes.includes(parsed.protocol)
  } catch {
    return true
  }
}

/**
 * Normalizes a URL for navigation. Returns `null` when the URL is not a
 * candidate for the http(s) protocols.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (isDangerousUrl(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Decides whether the raw text typed into the address bar is a URL, a search
 * query, or invalid input.
 */
export function resolveNavigationInput(input: string): NavigationIntent {
  const raw = input.trim()
  if (!raw) return { kind: 'invalid', reason: 'Empty address.' }
  if (CONTROL_CHARACTERS_RE.test(raw)) {
    return { kind: 'invalid', reason: 'Address contains unsupported control characters.' }
  }

  const schemeMatch = SCHEME_RE.exec(raw)
  if (schemeMatch?.[1]) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme === 'http' || scheme === 'https') {
      const normalized = normalizeUrl(raw)
      if (!normalized) return { kind: 'invalid', reason: 'That address could not be understood.' }
      return { kind: 'url', url: normalized }
    }
    if (BLOCKED_SCHEMES.has(scheme)) {
      return { kind: 'invalid', reason: `The "${scheme}:" protocol is not allowed.` }
    }
    // A loopback address is always served over plain HTTP.
    if (LOCALHOST_RE.test(raw)) {
      const url = normalizeUrl(`http://${raw}`)
      if (url) return { kind: 'url', url }
    }
    // The "scheme" may actually be a host with a port, e.g. `example.com:8080`.
    const rest = raw.slice(schemeMatch[0].length)
    if (/^\d{1,5}(?:[/?#].*)?$/.test(rest) && isHostLike(scheme)) {
      const url = normalizeUrl(`https://${raw}`)
      if (url) return { kind: 'url', url }
    }
    return { kind: 'invalid', reason: `The "${scheme}:" protocol is not supported.` }
  }

  if (/\s/.test(raw)) {
    return { kind: 'search', query: raw }
  }

  if (LOCALHOST_RE.test(raw)) {
    const url = normalizeUrl(`http://${raw}`)
    if (url) return { kind: 'url', url }
  }

  // `example.com`, `example.com/path` and `example.com?q=1` are all addresses.
  const host = hostPartOf(raw)
  if (host && isHostLike(host)) {
    const url = normalizeUrl(`https://${raw}`)
    if (url) return { kind: 'url', url }
  }

  // A bare path such as "/docs" or "docs/readme" is not a destination we can
  // reach — treat it as a search query rather than guessing a host.
  return {
    kind: 'search',
    query: raw
  }
}

/** True when the value looks like a host name or an IP address. */
function isHostLike(value: string): boolean {
  return HOST_RE.test(value) || IPV4_RE.test(value) || value.toLowerCase() === 'localhost'
}

/** Returns the host part of an address, i.e. everything before the path. */
function hostPartOf(raw: string): string {
  const index = raw.search(/[/?#]/)
  return index === -1 ? raw : raw.slice(0, index)
}

/** Convenience helper producing the final destination for a raw input. */
export function resolveDestination(
  input: string,
  options: { searchEngineId?: string; customSearchTemplate?: string } = {}
): { url: string } | { error: string } {
  const intent = resolveNavigationInput(input)
  if (intent.kind === 'url') return { url: intent.url }
  if (intent.kind === 'search') {
    return {
      url: buildSearchUrl(
        options.searchEngineId ?? 'duckduckgo',
        intent.query,
        options.customSearchTemplate
      )
    }
  }
  return { error: intent.reason }
}

/** Returns the registrable host of a URL, used for per-site zoom + permissions. */
export function getOriginHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** True when the URL points at a website that must be rendered by Chromium. */
export function isWebUrl(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** True when the URL addresses an internal page of the application shell. */
export function isInternalUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith('nexus://')
}

/** Returns the origin (`scheme://host[:port]`) of a URL. */
export function getOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null
    return parsed.origin
  } catch {
    return null
  }
}

/** Formats a URL for display in the address bar. */
export function formatUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.hostname}${path}${parsed.search}`
  } catch {
    return url
  }
}
