/**
 * Search engine definitions. Only the public search *page* is used — no provider
 * API keys are required or assumed.
 */

export interface SearchEngine {
  id: string
  label: string
  /** URL template where `%s` is replaced by the percent-encoded query. */
  template: string
  /** Origin used for favicon lookup. */
  faviconOrigin: string
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q=%s',
    faviconOrigin: 'https://duckduckgo.com'
  },
  {
    id: 'google',
    label: 'Google',
    template: 'https://www.google.com/search?q=%s',
    faviconOrigin: 'https://www.google.com'
  },
  {
    id: 'bing',
    label: 'Bing',
    template: 'https://www.bing.com/search?q=%s',
    faviconOrigin: 'https://www.bing.com'
  },
  {
    id: 'brave',
    label: 'Brave Search',
    template: 'https://search.brave.com/search?q=%s',
    faviconOrigin: 'https://search.brave.com'
  },
  {
    id: 'ecosia',
    label: 'Ecosia',
    template: 'https://www.ecosia.org/search?q=%s',
    faviconOrigin: 'https://www.ecosia.org'
  }
] as const

export const DEFAULT_SEARCH_ENGINE_ID = 'duckduckgo'

export function getSearchEngine(id: string): SearchEngine | undefined {
  return SEARCH_ENGINES.find((engine) => engine.id === id)
}

export function getDefaultSearchEngine(): SearchEngine {
  return (
    getSearchEngine(DEFAULT_SEARCH_ENGINE_ID) ?? {
      id: 'custom',
      label: 'Custom',
      template: 'https://duckduckgo.com/?q=%s',
      faviconOrigin: 'https://duckduckgo.com'
    }
  )
}

/**
 * Builds a search URL for the given engine. Falls back to the default engine
 * when the configured id is unknown or the custom template is malformed.
 */
export function buildSearchUrl(engineId: string, query: string, customTemplate?: string): string {
  const trimmed = query.trim()
  const template =
    engineId === 'custom' && customTemplate && customTemplate.includes('%s')
      ? customTemplate
      : (getSearchEngine(engineId) ?? getDefaultSearchEngine()).template

  try {
    // Validate the template is a safe https URL before using it.
    const probe = new URL(template.replace('%s', 'probe'))
    if (probe.protocol !== 'https:' && probe.protocol !== 'http:') {
      throw new Error('unsupported search protocol')
    }
  } catch {
    return `${getDefaultSearchEngine().template.replace('%s', encodeURIComponent(trimmed))}`
  }

  return template.replace('%s', encodeURIComponent(trimmed))
}
