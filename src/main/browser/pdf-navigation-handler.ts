import { createLogger } from '../utils/logger'

const logger = createLogger('pdf-navigation')

/**
 * How long a URL is remembered as "already turned into a download".
 *
 * Starting a download repeats the network request. The repeated request must
 * not be cancelled again, otherwise the download would never start. A short
 * window is enough because the duplicate request follows immediately.
 */
const HANDLED_TTL_MS = 15_000

export interface PdfNavigationHandlerOptions {
  /** The sessions used by the website views. */
  sessions: Electron.Session[]
}

/**
 * Turns main-frame navigations to PDF files into downloads.
 *
 * Electron's built-in PDF viewer does not render in this configuration: a link
 * to a PDF (a "Download CV" button on a portfolio page, for example) commits an
 * empty document, so the file is neither shown nor saved. Instead of leaving
 * the user on a blank page, the navigation is intercepted and the file is
 * handed to the regular download pipeline, which stores it in the download
 * folder and records it in the downloads list.
 *
 * Only the top-level document is intercepted. PDFs embedded in a page keep
 * whatever behaviour the page itself provides.
 */
export class PdfNavigationHandler {
  private readonly options: PdfNavigationHandlerOptions
  private readonly attached = new Set<Electron.Session>()
  /** URL -> time the download was started. */
  private readonly handled = new Map<string, number>()
  /** URL -> time the navigation was cancelled in favour of the download. */
  private readonly expectedFailures = new Map<string, number>()

  constructor(options: PdfNavigationHandlerOptions) {
    this.options = options
  }

  /** Installs the interceptor on every session that is not watched yet. */
  attach(): void {
    for (const target of this.options.sessions) {
      if (!target || this.attached.has(target)) continue
      this.attached.add(target)

      target.webRequest.onHeadersReceived(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, callback) => {
          const rawType =
            details.responseHeaders?.['Content-Type']?.[0] ??
            details.responseHeaders?.['content-type']?.[0] ??
            ''
          const contentType = rawType.split(';')[0]?.trim().toLowerCase() ?? ''
          if (details.resourceType !== 'mainFrame' || contentType !== 'application/pdf') {
            callback({})
            return
          }

          // An `attachment` disposition already makes Chromium download the
          // file; intercepting it would only repeat the request.
          const disposition =
            details.responseHeaders?.['Content-Disposition']?.[0] ??
            details.responseHeaders?.['content-disposition']?.[0] ??
            ''
          if (disposition.toLowerCase().includes('attachment')) {
            callback({})
            return
          }

          const now = Date.now()
          this.prune(now)
          if (this.handled.has(details.url)) {
            // This is the download request that was started for the
            // navigation; it has to reach the network stack untouched.
            callback({})
            return
          }

          this.handled.set(details.url, now)
          this.expectedFailures.set(details.url, now)
          callback({ cancel: true })

          logger.info('downloading a document that cannot be rendered', { url: details.url })
          try {
            target.downloadURL(details.url)
          } catch (error) {
            logger.error('could not start the download', {
              url: details.url,
              message: error instanceof Error ? error.message : String(error)
            })
            this.handled.delete(details.url)
            return
          }
        }
      )

      // Once the download really started, the URL may be intercepted again:
      // the guard above only protects the duplicate request that belongs to
      // the download itself.
      target.on('will-download', (_event, item) => {
        this.handled.delete(item.getURL())
      })
    }
  }

  /**
   * Reports whether a failed navigation is the expected cancellation of a
   * navigation that was replaced by a download.
   *
   * Chromium reports the cancellation more than once (provisional and final
   * load), so the entry stays until it expires instead of being consumed.
   */
  isExpectedNavigationFailure(url: string): boolean {
    const startedAt = this.expectedFailures.get(url)
    if (startedAt === undefined) return false
    return Date.now() - startedAt < HANDLED_TTL_MS
  }

  private prune(now: number): void {
    for (const [url, startedAt] of this.handled) {
      if (now - startedAt > HANDLED_TTL_MS) this.handled.delete(url)
    }
    for (const [url, startedAt] of this.expectedFailures) {
      if (now - startedAt > HANDLED_TTL_MS) this.expectedFailures.delete(url)
    }
  }
}
