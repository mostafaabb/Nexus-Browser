/** Download manager types. */

export type DownloadStatus = 'progressing' | 'completed' | 'cancelled' | 'interrupted' | 'failed'

export interface DownloadRecord {
  id: string
  url: string
  filename: string
  /** Absolute path on disk once the file is written. */
  path: string | null
  mimeType: string | null
  /** Total size in bytes when the server reports it. */
  totalBytes: number | null
  receivedBytes: number
  status: DownloadStatus
  startedAt: number
  endedAt: number | null
  error: string | null
  referrer: string | null
  /** True when the user chose a location with the native save dialog. */
  saveAs: boolean
}
