/**
 * Third-party cookie policy.
 *
 * Electron does not expose Chromium's content settings, so the policy is
 * enforced on the network layer: a `Set-Cookie` header is removed from a
 * response whose origin differs from the origin of the site that made the
 * request.
 *
 * A cookie counts as third-party when its origin differs from the origin of
 * the top level page. The top level origin is read from the requesting web
 * contents; the request initiator is used as a fallback when the top level
 * page is not known yet (for example while a frame is still loading).
 */

import type { Session } from 'electron'
import { getOrigin } from '@shared/navigation/url'
import { createLogger } from '../utils/logger'

const logger = createLogger('cookies')

export interface CookiePolicyOptions {
  /** The sessions the policy is installed on. */
  sessions: Session[]
}

export class CookiePolicy {
  private readonly sessions: Session[]
  private blocking = false

  constructor(options: CookiePolicyOptions) {
    this.sessions = options.sessions
  }

  /** True while third-party cookies are being blocked. */
  get isBlocking(): boolean {
    return this.blocking
  }

  /**
   * Enables or disables the blocking.
   *
   * The request interceptor stays installed either way, because it has to be
   * in place before the first response arrives.
   */
  setBlocking(blocking: boolean): void {
    this.blocking = blocking
    logger.info('third-party cookie policy updated', { blocking })
  }

  /** Installs the interceptor on every session. */
  attach(): void {
    for (const session of this.sessions) {
      session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
        if (!this.blocking) {
          callback({})
          return
        }
        const headers = details.responseHeaders
        if (!headers) {
          callback({})
          return
        }
        const setCookie = headers['Set-Cookie'] ?? headers['set-cookie']
        if (!setCookie || setCookie.length === 0) {
          callback({})
          return
        }

        const cookieOrigin = getOrigin(details.url)
        const siteOrigin = this.siteOrigin(details)
        if (!cookieOrigin || !siteOrigin || cookieOrigin === siteOrigin) {
          callback({})
          return
        }

        const filtered: Record<string, string[]> = {}
        for (const [name, value] of Object.entries(headers)) {
          if (name.toLowerCase() === 'set-cookie') continue
          filtered[name] = value
        }
        logger.debug('blocked a third-party cookie', { url: details.url, siteOrigin })
        callback({ responseHeaders: filtered })
      })
    }
  }

  /**
   * The origin of the site the request belongs to.
   *
   * The top level page is used because that is what Chromium compares against.
   * The initiator of the request is the fallback.
   */
  private siteOrigin(details: Electron.OnHeadersReceivedListenerDetails): string | null {
    const topLevel = details.webContents?.mainFrame?.url
    const topLevelOrigin = topLevel ? getOrigin(topLevel) : null
    if (topLevelOrigin) return topLevelOrigin
    return details.initiatorOrigin ? getOrigin(details.initiatorOrigin) : null
  }
}
