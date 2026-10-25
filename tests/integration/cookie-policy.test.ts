import type { Session } from 'electron'
import { beforeEach, describe, expect, it } from 'vitest'
import { CookiePolicy } from '@main/privacy/cookie-policy'

/**
 * Unit tests for the third-party cookie policy.
 *
 * The policy is exercised through the `onHeadersReceived` listener it installs
 * on the session, so the tests observe exactly what Electron would hand it.
 */

type Listener = (
  details: Electron.OnHeadersReceivedListenerDetails,
  callback: (response: Electron.HeadersReceivedResponse) => void
) => void

type Headers = Electron.OnHeadersReceivedListenerDetails

let listeners: Listener[] = []

/** Builds a session stub that exposes the listener the policy installs. */
function createSessionStub(): {
  session: Session
  invoke: (details: Partial<Headers>) => Electron.HeadersReceivedResponse
} {
  const session = {
    webRequest: {
      onHeadersReceived: (_filter: unknown, listener: Listener) => {
        listeners.push(listener)
      }
    }
  } as unknown as Session

  return {
    session,
    invoke: (details) => {
      const listener = listeners[listeners.length - 1]
      if (!listener) throw new Error('the policy did not install a listener')
      let response: Electron.HeadersReceivedResponse = {}
      listener(
        {
          id: 1,
          url: 'https://cdn.example.net/pixel',
          method: 'GET',
          resourceType: 'image',
          referrer: '',
          timestamp: 0,
          statusLine: 'HTTP/1.1 200 OK',
          statusCode: 200,
          ...details
        } as Headers,
        (result) => {
          response = result
        }
      )
      return response
    }
  }
}

/** Attaches the policy with blocking enabled. */
function createBlockingPolicy(): {
  invoke: (details: Partial<Headers>) => Electron.HeadersReceivedResponse
} {
  const { session, invoke } = createSessionStub()
  const policy = new CookiePolicy({ sessions: [session] })
  policy.attach()
  policy.setBlocking(true)
  return { invoke }
}

beforeEach(() => {
  listeners = []
})

describe('CookiePolicy', () => {
  it('does not touch responses while blocking is disabled', () => {
    const { session, invoke } = createSessionStub()
    const policy = new CookiePolicy({ sessions: [session] })
    policy.attach()
    policy.setBlocking(false)

    const response = invoke({
      url: 'https://ads.example.net/pixel',
      responseHeaders: { 'Set-Cookie': ['tracker=1'] }
    })

    expect(response).toEqual({})
    expect(policy.isBlocking).toBe(false)
  })

  it('keeps a first-party cookie', () => {
    const { invoke } = createBlockingPolicy()

    const response = invoke({
      url: 'https://example.com/api',
      responseHeaders: { 'Set-Cookie': ['session=abc'] },
      webContents: { mainFrame: { url: 'https://example.com/page' } } as never
    })

    expect(response).toEqual({})
  })

  it('removes a third-party cookie without touching the other headers', () => {
    const { invoke } = createBlockingPolicy()

    const response = invoke({
      url: 'https://ads.example.net/pixel',
      responseHeaders: {
        'Content-Type': ['image/gif'],
        'Set-Cookie': ['tracker=1'],
        'Cache-Control': ['no-store']
      },
      webContents: { mainFrame: { url: 'https://example.com/page' } } as never
    })

    expect(response.responseHeaders).toEqual({
      'Content-Type': ['image/gif'],
      'Cache-Control': ['no-store']
    })
  })

  it('recognises the header regardless of its casing', () => {
    const { invoke } = createBlockingPolicy()

    const response = invoke({
      url: 'https://ads.example.net/pixel',
      responseHeaders: { 'set-cookie': ['tracker=1'] },
      webContents: { mainFrame: { url: 'https://example.com/page' } } as never
    })

    expect(response.responseHeaders).toEqual({})
  })

  it('compares against the initiator when the top level page is unknown', () => {
    const { invoke } = createBlockingPolicy()

    // A sub-resource requested by another site is third-party.
    const thirdParty = invoke({
      url: 'http://127.0.0.1:5001/pixel',
      responseHeaders: { 'Set-Cookie': ['tracker=1'] },
      initiatorOrigin: 'http://127.0.0.1:5000'
    })
    expect(thirdParty.responseHeaders).toEqual({})

    // A sub-resource requested by the same site is first-party.
    const firstParty = invoke({
      url: 'http://127.0.0.1:5000/pixel',
      responseHeaders: { 'Set-Cookie': ['session=abc'] },
      initiatorOrigin: 'http://127.0.0.1:5000'
    })
    expect(firstParty).toEqual({})
  })

  it('ignores responses that do not set cookies', () => {
    const { invoke } = createBlockingPolicy()

    const response = invoke({
      url: 'https://ads.example.net/pixel',
      responseHeaders: { 'Content-Type': ['image/gif'] },
      webContents: { mainFrame: { url: 'https://example.com/page' } } as never
    })

    expect(response).toEqual({})
  })
})
