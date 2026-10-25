/**
 * Content Security Policy injection for the application shell.
 *
 * The shell is privileged: it can talk to the main process through the
 * preload bridge. A strict `default-src 'none'` policy makes sure that no
 * injected script can load or exfiltrate anything.
 *
 * During development Vite needs inline scripts, `eval` and a websocket
 * connection for hot module replacement, so a relaxed policy is used there.
 */

import type { Plugin } from 'vite'

const PROD_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "worker-src 'self'"
].join('; ')

const DEV_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/**
 * Injects a `<meta http-equiv="Content-Security-Policy">` tag into the shell
 * document. The policy is enforced again through response headers in the main
 * process — the meta tag is the second line of defence.
 */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'nexus:csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server ? DEV_POLICY : PROD_POLICY
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend'
          }
        ]
      }
    }
  }
}
