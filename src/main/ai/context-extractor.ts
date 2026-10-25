import { MAX_AI_CONTEXT_CHARS } from '@shared/constants/app'
import type { AiContextItem } from '@shared/types'
import type { BrowserViewManager } from '../browser/browser-view-manager'

/** Isolated world id used for all page introspection. */
const READER_WORLD = 9999

interface ReaderPayload {
  ok: boolean
  reason?: string
  title?: string
  byline?: string | null
  url?: string
  text?: string
  wordCount?: number
}

const READER_SCRIPT = `(() => {
  try {
    const doc = document;
    if (!doc || !doc.body) return { ok: false, reason: 'no-body' };
    const candidates = [
      doc.querySelector('article'),
      doc.querySelector('main'),
      doc.querySelector('[role="main"]'),
      doc.body
    ].filter(Boolean);
    let best = null;
    let bestLength = 0;
    for (const node of candidates) {
      const length = (node.innerText || node.textContent || '').trim().length;
      if (length > bestLength) { bestLength = length; best = node; }
    }
    if (!best) return { ok: false, reason: 'no-content' };
    const clone = best.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,iframe,svg,canvas,nav,footer,aside,form,button,template').forEach((node) => node.remove());
    const text = (clone.innerText || clone.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
    const bylineNode = doc.querySelector('[rel="author"], .author, .byline, [itemprop="author"]');
    return {
      ok: text.length > 120,
      reason: text.length > 120 ? undefined : 'content-too-short',
      title: doc.title || '',
      byline: bylineNode ? (bylineNode.innerText || bylineNode.textContent || '').trim().slice(0, 200) : null,
      url: location.href,
      text: text,
      wordCount: text ? text.split(/\\s+/).filter(Boolean).length : 0
    };
  } catch (error) {
    return { ok: false, reason: 'extraction-failed' };
  }
})()`

const SELECTION_SCRIPT = `(() => {
  try {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    return { text: text || '', url: location.href, title: document.title || '' };
  } catch (error) {
    return { text: '' };
  }
})()`

/**
 * Extracts page context from website views.
 *
 * The extraction runs inside an isolated world so that page scripts cannot
 * tamper with the result, and it never bypasses authentication or access
 * controls — only content the browser itself can already see is returned.
 */
export class ContextExtractor {
  constructor(private readonly views: BrowserViewManager) {}

  async extractReadable(tabId: string): Promise<ReaderPayload> {
    const contents = this.views.getWebContents(tabId)
    if (!contents || contents.isDestroyed()) {
      return { ok: false, reason: 'no-view' }
    }
    try {
      const result = (await contents.executeJavaScriptInIsolatedWorld(
        READER_WORLD,
        [{ code: READER_SCRIPT }],
        false
      )) as ReaderPayload
      return result ?? { ok: false, reason: 'no-result' }
    } catch {
      return { ok: false, reason: 'extraction-failed' }
    }
  }

  async extractSelection(tabId: string): Promise<string> {
    const contents = this.views.getWebContents(tabId)
    if (!contents || contents.isDestroyed()) return ''
    try {
      const result = (await contents.executeJavaScriptInIsolatedWorld(
        READER_WORLD,
        [{ code: SELECTION_SCRIPT }],
        false
      )) as { text?: string }
      return typeof result?.text === 'string' ? result.text.trim() : ''
    } catch {
      return ''
    }
  }

  /** Builds the context bundle for the given tabs. */
  async buildBundle(
    tabIds: string[],
    options: { includeSelection?: boolean; includeReadable?: boolean } = {}
  ): Promise<AiContextItem[]> {
    const items: AiContextItem[] = []

    for (const tabId of tabIds) {
      const contents = this.views.getWebContents(tabId)
      if (!contents || contents.isDestroyed()) continue
      const url = contents.getURL()
      const title = contents.getTitle()

      if (options.includeSelection) {
        const selection = await this.extractSelection(tabId)
        if (selection) {
          items.push({
            kind: 'selection',
            label: `Selection on ${title || url}`,
            url,
            title,
            text: selection,
            characters: selection.length,
            truncated: false
          })
        }
      }

      if (options.includeReadable) {
        const reader = await this.extractReadable(tabId)
        if (reader.ok && reader.text) {
          items.push({
            kind: 'reader',
            label: `Article: ${reader.title || title || url}`,
            url: reader.url ?? url,
            title: reader.title ?? title,
            text: reader.text,
            characters: reader.text.length,
            truncated: false
          })
        } else {
          const fallback = await this.extractVisibleText(tabId)
          if (fallback) {
            items.push({
              kind: 'page',
              label: `Visible text of ${title || url}`,
              url,
              title,
              text: fallback,
              characters: fallback.length,
              truncated: false
            })
          }
        }
      }
    }

    return truncateBundle(items)
  }

  private async extractVisibleText(tabId: string): Promise<string> {
    const contents = this.views.getWebContents(tabId)
    if (!contents || contents.isDestroyed()) return ''
    try {
      const result = (await contents.executeJavaScriptInIsolatedWorld(
        READER_WORLD,
        [
          {
            code: `(() => {
            try {
              const body = document.body;
              if (!body) return { text: '' };
              const text = (body.innerText || body.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
              return { text: text };
            } catch (error) { return { text: '' }; }
          })()`
          }
        ],
        false
      )) as { text?: string }
      return typeof result?.text === 'string' ? result.text : ''
    } catch {
      return ''
    }
  }
}

/** Limits the total amount of context that may be sent to a provider. */
export function truncateBundle(
  items: AiContextItem[],
  limit = MAX_AI_CONTEXT_CHARS
): AiContextItem[] {
  const total = items.reduce((sum, item) => sum + item.text.length, 0)
  if (total <= limit) return items

  const ratio = limit / total
  return items.map((item) => {
    const maxLength = Math.max(200, Math.floor(item.text.length * ratio))
    if (item.text.length <= maxLength) return item
    return {
      ...item,
      text: `${item.text.slice(0, maxLength)}\n\n[content truncated]`,
      characters: maxLength,
      truncated: true
    }
  })
}
