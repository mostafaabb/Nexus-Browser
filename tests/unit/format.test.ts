import { describe, expect, it } from 'vitest'
import {
  colorForLabel,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  hostOf,
  humanize,
  shortenUrl
} from '@renderer/lib/format'

describe('formatBytes', () => {
  it('renders bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('renders kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('renders megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('rounds large units', () => {
    expect(formatBytes(500 * 1024 * 1024)).toBe('500 MB')
  })

  it('renders a dash for a missing value', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(undefined)).toBe('—')
  })
})

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000

  it('renders "just now"', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
  })

  it('renders minutes', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 minute ago')
    expect(formatRelativeTime(now - 120_000, now)).toBe('2 minutes ago')
  })

  it('renders hours', () => {
    expect(formatRelativeTime(now - 3_600_000, now)).toBe('1 hour ago')
  })

  it('renders days', () => {
    expect(formatRelativeTime(now - 86_400_000 * 3, now)).toBe('3 days ago')
  })

  it('never renders a negative duration', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('just now')
  })
})

describe('formatDuration', () => {
  it('renders milliseconds', () => {
    expect(formatDuration(250)).toBe('250 ms')
  })

  it('renders seconds', () => {
    expect(formatDuration(1_500)).toBe('1.50 s')
  })

  it('renders minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1m 5s')
  })

  it('renders a dash for a missing value', () => {
    expect(formatDuration(null)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('produces a non empty string', () => {
    expect(formatDateTime(1_700_000_000_000).length).toBeGreaterThan(0)
  })
})

describe('formatPercent', () => {
  it('renders whole percentages', () => {
    expect(formatPercent(0.5)).toBe('50%')
    expect(formatPercent(0.125)).toBe('13%')
  })
})

describe('shortenUrl', () => {
  it('keeps short urls', () => {
    expect(shortenUrl('https://a.com')).toBe('https://a.com')
  })

  it('truncates long urls', () => {
    const result = shortenUrl(`https://example.com/${'x'.repeat(200)}`, 40)
    expect(result.length).toBe(40)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('hostOf', () => {
  it('extracts the host', () => {
    expect(hostOf('https://example.com/a')).toBe('example.com')
  })

  it('returns the raw value for an invalid url', () => {
    expect(hostOf('nonsense')).toBe('nonsense')
  })
})

describe('humanize', () => {
  it('turns identifiers into titles', () => {
    expect(humanize('some_identifier')).toBe('Some identifier')
    expect(humanize('kebab-case')).toBe('Kebab case')
  })

  it('keeps an empty value', () => {
    expect(humanize('')).toBe('')
  })
})

describe('colorForLabel', () => {
  it('is deterministic', () => {
    expect(colorForLabel('alpha')).toBe(colorForLabel('alpha'))
  })

  it('produces an hsl colour', () => {
    expect(colorForLabel('alpha')).toMatch(/^hsl\(\d+ 68% 58%\)$/)
  })
})
