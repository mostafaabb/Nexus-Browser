/**
 * Contract tests for the privileged IPC surface.
 *
 * The renderer must not be able to reach a channel that the main process does
 * not know, and every declared channel must actually be implemented.
 */

import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS } from '@shared/contracts/channels'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const channels = Object.values(IPC_CHANNELS)
const events = Object.values(IPC_EVENTS)

describe('channel names', () => {
  it('uses unique names', () => {
    expect(new Set(channels).size).toBe(channels.length)
    expect(new Set(events).size).toBe(events.length)
  })

  it('namespaces every channel with a prefix', () => {
    for (const channel of channels) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/)
    }
  })

  it('never reuses a channel name for an event', () => {
    const overlap = channels.filter((channel) => (events as readonly string[]).includes(channel))
    expect(overlap).toEqual([])
  })
})

describe('preload bridge', () => {
  const source = readFileSync(resolve(__dirname, '../../src/preload/index.ts'), 'utf8')

  it('never exposes ipcRenderer directly', () => {
    // The context bridge must only expose the typed `nexus` object.
    expect(source).not.toMatch(/exposeInMainWorld\(\s*['"]ipcRenderer['"]/)
    expect(source).not.toMatch(/exposeInMainWorld\(\s*['"]require['"]/)
    expect(source).not.toMatch(/exposeInMainWorld\(\s*['"]process['"]/)
  })

  it('exposes exactly one global', () => {
    const exposures = source.match(/exposeInMainWorld\(/g) ?? []
    expect(exposures).toHaveLength(1)
  })

  it('only invokes channels that are declared in the contract', () => {
    const invoked = [...source.matchAll(/call\(\s*'([^']+)'/g)].map((match) => match[1]!)
    expect(invoked.length).toBeGreaterThan(0)
    for (const channel of invoked) {
      expect(channels).toContain(channel)
    }
  })

  it('only subscribes to events that are declared in the contract', () => {
    const subscribed = [...source.matchAll(/IPC_EVENTS\.(\w+)/g)].map((match) => match[1]!)
    const eventNames = Object.keys(IPC_EVENTS)
    for (const name of subscribed) {
      expect(eventNames).toContain(name)
    }
  })
})

describe('main process handlers', () => {
  const source = readFileSync(resolve(__dirname, '../../src/main/ipc/register-ipc.ts'), 'utf8')

  it('registers every declared channel', () => {
    for (const [name, channel] of Object.entries(IPC_CHANNELS)) {
      expect(source, `missing handler for ${name} (${channel})`).toContain(`IPC_CHANNELS.${name}`)
    }
  })

  it('rejects calls from an unknown sender', () => {
    expect(source).toContain('UNAUTHORIZED_SENDER')
    expect(source).toContain('getContextByWebContents')
  })

  it('returns an envelope instead of throwing raw errors', () => {
    expect(source).toContain('ok: false')
    expect(source).toContain('toSerializedError')
  })
})
