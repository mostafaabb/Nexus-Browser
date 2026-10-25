/**
 * Tests for the download path helper of the main process.
 */

import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const existing = new Set<string>()

vi.mock('electron', () => ({
  app: { getPath: () => '', isPackaged: false },
  dialog: {},
  session: {},
  shell: {}
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: (path: string) => existing.has(path) }
})

const { resolveSavePath } = await import('@main/downloads/download-manager')

const DIRECTORY = join('downloads')

beforeEach(() => {
  existing.clear()
})

describe('resolveSavePath', () => {
  it('uses the plain name when the file does not exist yet', () => {
    expect(resolveSavePath(DIRECTORY, 'cv.pdf')).toBe(join(DIRECTORY, 'cv.pdf'))
  })

  it('appends a counter instead of overwriting an existing file', () => {
    existing.add(join(DIRECTORY, 'cv.pdf'))
    expect(resolveSavePath(DIRECTORY, 'cv.pdf')).toBe(join(DIRECTORY, 'cv (1).pdf'))
  })

  it('keeps counting when earlier copies exist', () => {
    existing.add(join(DIRECTORY, 'cv.pdf'))
    existing.add(join(DIRECTORY, 'cv (1).pdf'))
    existing.add(join(DIRECTORY, 'cv (2).pdf'))
    expect(resolveSavePath(DIRECTORY, 'cv.pdf')).toBe(join(DIRECTORY, 'cv (3).pdf'))
  })

  it('keeps a name without extension intact', () => {
    existing.add(join(DIRECTORY, 'README'))
    expect(resolveSavePath(DIRECTORY, 'README')).toBe(join(DIRECTORY, 'README (1)'))
  })

  it('treats a leading dot as part of the name, not as an extension', () => {
    existing.add(join(DIRECTORY, '.env'))
    expect(resolveSavePath(DIRECTORY, '.env')).toBe(join(DIRECTORY, '.env (1)'))
  })
})
