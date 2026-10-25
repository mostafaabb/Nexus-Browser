/**
 * Tests for the hardening helpers of the main process.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '', isPackaged: false },
  dialog: {},
  session: {},
  shell: {}
}))

const { sanitizeFilename } = await import('@main/downloads/download-manager')

describe('sanitizeFilename', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf')
  })

  it('removes directory components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\Windows\\System32\\cmd.exe')).toBe('cmd.exe')
  })

  it('removes characters that are reserved on Windows', () => {
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt')
  })

  it('removes control characters', () => {
    expect(sanitizeFilename('na\u0000me\u0007.txt')).toBe('name.txt')
  })

  it('removes leading dots so that no hidden file is created', () => {
    expect(sanitizeFilename('...secret')).toBe('secret')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeFilename('  file.txt  ')).toBe('file.txt')
  })

  it('rejects a name that has nothing usable left', () => {
    expect(() => sanitizeFilename('   ')).toThrow()
    expect(() => sanitizeFilename('...')).toThrow()
  })

  it('limits the length of the name', () => {
    const result = sanitizeFilename(`${'a'.repeat(400)}.txt`)
    expect(result.length).toBeLessThanOrEqual(180)
  })
})
