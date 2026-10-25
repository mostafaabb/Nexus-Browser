/** Browsing history types. */

export interface HistoryEntry {
  id: string
  url: string
  title: string
  /** Timestamp of the most recent visit (epoch milliseconds). */
  visitedAt: number
  /** Timestamp of the first visit for this URL. */
  firstVisitedAt: number
  visitCount: number
}

export type HistoryRange = 'all' | 'hour' | 'day' | 'week' | 'month'

export interface HistoryQuery {
  search?: string
  range?: HistoryRange
  limit?: number
  offset?: number
}
