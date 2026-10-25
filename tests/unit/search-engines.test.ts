import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  DEFAULT_SEARCH_ENGINE_ID,
  getDefaultSearchEngine,
  getSearchEngine,
  SEARCH_ENGINES
} from '@shared/constants/search-engines'

describe('search engines', () => {
  it('exposes a non empty list of engines', () => {
    expect(SEARCH_ENGINES.length).toBeGreaterThan(0)
  })

  it('uses unique ids', () => {
    const ids = SEARCH_ENGINES.map((engine) => engine.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses https templates that contain a %s placeholder', () => {
    for (const engine of SEARCH_ENGINES) {
      expect(engine.template.startsWith('https://')).toBe(true)
      expect(engine.template).toContain('%s')
    }
  })

  it('finds an engine by id', () => {
    expect(getSearchEngine('google')?.label).toBe('Google')
    expect(getSearchEngine('does-not-exist')).toBeUndefined()
  })

  it('has a default engine', () => {
    expect(getDefaultSearchEngine().id).toBe(DEFAULT_SEARCH_ENGINE_ID)
  })
})

describe('buildSearchUrl', () => {
  it('percent encodes the query', () => {
    const url = buildSearchUrl('duckduckgo', 'a b&c=d')
    expect(url).toBe('https://duckduckgo.com/?q=a%20b%26c%3Dd')
  })

  it('falls back to the default engine for an unknown id', () => {
    expect(buildSearchUrl('nope', 'test')).toContain('duckduckgo.com')
  })

  it('uses a custom template when the id is "custom"', () => {
    const url = buildSearchUrl('custom', 'hello', 'https://search.example/?term=%s')
    expect(url).toBe('https://search.example/?term=hello')
  })

  it('ignores a custom template without a placeholder', () => {
    const url = buildSearchUrl('custom', 'hello', 'https://search.example/?term=fixed')
    expect(url).toContain('duckduckgo.com')
  })

  it('rejects a custom template with an unsafe scheme', () => {
    const url = buildSearchUrl('custom', 'hello', 'javascript:alert(1)%s')
    expect(url.startsWith('https://')).toBe(true)
    expect(url).toContain('duckduckgo.com')
  })

  it('rejects a custom template that is not a URL', () => {
    const url = buildSearchUrl('custom', 'hello', 'not a url %s')
    expect(url.startsWith('https://')).toBe(true)
  })
})
