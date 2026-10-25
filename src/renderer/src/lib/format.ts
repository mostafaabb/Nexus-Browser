/** Formatting helpers shared by the user interface. */

/** Formats a byte count using binary units. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

/** Formats a timestamp as a short, locale aware date and time. */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Formats a timestamp as a relative duration ("3 minutes ago"). */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000

  if (delta < minute) return 'just now'
  if (delta < hour) {
    const minutes = Math.floor(delta / minute)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (delta < day) {
    const hours = Math.floor(delta / hour)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (delta < 7 * day) {
    const days = Math.floor(delta / day)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** Formats a duration in milliseconds as a compact string. */
export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined) return '—'
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(2)} s`
  // The seconds are rounded first and then carried into the minutes so that
  // a duration never renders as "1m 60s".
  const totalSeconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

/** Formats a percentage with a single decimal. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** Shortens a URL for display, keeping the host visible. */
export function shortenUrl(url: string, maxLength = 64): string {
  if (url.length <= maxLength) return url
  return `${url.slice(0, maxLength - 1)}…`
}

/** Returns the host of a URL, or the raw string when it cannot be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Converts a snake/kebab identifier into a readable title. */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim()
  if (!spaced) return value
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Produces a deterministic, readable colour for an arbitrary label. */
export function colorForLabel(label: string): string {
  let hash = 0
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) % 360
  }
  return `hsl(${hash} 68% 58%)`
}
