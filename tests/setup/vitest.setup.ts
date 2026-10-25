/**
 * Global test setup.
 *
 * The setup runs for every environment. It installs the browser APIs that
 * jsdom does not implement and provides a stub for the privileged bridge so
 * that renderer components can be rendered in isolation.
 */

import { afterEach, vi } from 'vitest'

/* ------------------------------------------------------------------ jsdom --- */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      })
    })
  }

  if (!window.ResizeObserver) {
    class ResizeObserverStub implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverStub
    })
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {}
  }
}

/* ---------------------------------------------------------- privileged api --- */

/**
 * A permissive stub of `window.nexus`.
 *
 * Every method resolves with `undefined` unless a test overrides it. The
 * stub is intentionally minimal: a component test that needs real behaviour
 * replaces the relevant method.
 */
function createNexusStub(): Record<string, unknown> {
  const invoke = (): Promise<undefined> => Promise.resolve(undefined)
  const namespace = (): Record<string, unknown> => {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, property: string) {
        if (property in target) return target[property]
        const child = namespace()
        target[property] = child
        return child
      }
    }
    return new Proxy({}, handler)
  }
  const root = namespace()
  root.on = (): (() => void) => () => undefined
  root.removeAllListeners = (): void => undefined
  root.__invoke = invoke
  return root
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'nexus', {
    writable: true,
    configurable: true,
    value: createNexusStub()
  })
}

/* ---------------------------------------------------------------- cleanup --- */

afterEach(async () => {
  vi.restoreAllMocks()
  // React Testing Library only registers its automatic cleanup when a global
  // `afterEach` exists. The suite runs without globals, so it is done here.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
})
