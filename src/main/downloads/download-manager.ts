import { app, dialog, session, shell } from 'electron'
import { join, basename } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { ERROR_CODES, AppError } from '@shared/errors'
import { DEFAULT_PARTITION } from '@shared/constants/app'
import type { DownloadRecord, DownloadStatus } from '@shared/types'
import type { DownloadsRepository } from '../database/repositories/downloads-repository'
import type { SettingsRepository } from '../database/repositories/settings-repository'
import { createLogger } from '../utils/logger'

const logger = createLogger('downloads')

export interface DownloadManagerOptions {
  downloads: DownloadsRepository
  settings: SettingsRepository
  onUpdated: (record: DownloadRecord) => void
  onRemoved: (id: string) => void
  /** Returns the Electron session partitions that must be observed. */
  partitions: string[]
}

/**
 * Watches Electron download events and keeps the download database in sync.
 * Progress is reported from real Electron events only — nothing is simulated.
 */
export class DownloadManager {
  private readonly options: DownloadManagerOptions
  private readonly items = new Map<string, Electron.DownloadItem>()
  private attached = new Set<string>()

  constructor(options: DownloadManagerOptions) {
    this.options = options
  }

  attach(): void {
    for (const partition of this.options.partitions) {
      const target =
        partition === DEFAULT_PARTITION ? session.defaultSession : session.fromPartition(partition)
      if (!target || this.attached.has(partition)) continue
      this.attached.add(partition)
      target.on('will-download', (_event, item, webContents) => {
        this.handleWillDownload(item, webContents)
      })
    }
  }

  private handleWillDownload(item: Electron.DownloadItem, webContents: Electron.WebContents): void {
    const settings = this.options.settings.getAll()
    // A hostile `Content-Disposition` header must never be able to crash the
    // main process, so the file name is sanitised defensively.
    let filename: string
    try {
      filename = sanitizeFilename(item.getFilename())
    } catch (error) {
      logger.warn('falling back to a generated download name', {
        message: error instanceof Error ? error.message : 'unknown error'
      })
      filename = `download-${Date.now()}`
    }
    const directory = settings.downloadDirectory ?? appDownloadsDirectory()
    const id = `${item.getStartTime()}-${Math.random().toString(36).slice(2, 10)}`

    try {
      if (settings.askWhereToSave) {
        item.setSaveDialogOptions({
          defaultPath: join(directory, filename),
          title: 'Save download'
        })
      } else {
        ensureDirectory(directory)
        item.setSavePath(resolveSavePath(directory, filename))
      }
    } catch (error) {
      logger.warn('could not set save path', {
        message: error instanceof Error ? error.message : 'unknown error'
      })
    }

    const record = this.options.downloads.create({
      id,
      url: item.getURL(),
      filename,
      referrer: item.getInitiatorOrigin(),
      mimeType: item.getMimeType(),
      saveAs: settings.askWhereToSave
    })
    this.items.set(id, item)
    this.options.onUpdated(record)

    item.on('updated', (_event, state) => {
      const current = this.options.downloads.get(id)
      if (!current) return
      const total = item.getTotalBytes()
      const received = item.getReceivedBytes()
      const status: DownloadStatus =
        state === 'progressing'
          ? 'progressing'
          : current.status === 'progressing'
            ? 'progressing'
            : current.status
      const updated = this.options.downloads.update(id, {
        status,
        receivedBytes: received,
        totalBytes: total > 0 ? total : null,
        path: item.getSavePath() || current.path
      })
      if (updated) this.options.onUpdated(updated)
    })

    item.once('done', (_event, state) => {
      const current = this.options.downloads.get(id)
      if (!current) return
      const path = item.getSavePath() || current.path
      const status: DownloadStatus =
        state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted'
      const updated = this.options.downloads.update(id, {
        status,
        path,
        endedAt: Date.now(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes() > 0 ? item.getTotalBytes() : current.totalBytes,
        error:
          state === 'completed'
            ? null
            : state === 'cancelled'
              ? null
              : `The download was interrupted (${state}).`
      })
      this.items.delete(id)
      if (updated) this.options.onUpdated(updated)
      logger.info('download finished', { id, state })
    })

    void webContents
  }

  list(): DownloadRecord[] {
    return this.options.downloads.list()
  }

  cancel(id: string): DownloadRecord | null {
    const item = this.items.get(id)
    if (item) {
      item.cancel()
      const updated = this.options.downloads.update(id, {
        status: 'cancelled',
        endedAt: Date.now(),
        error: null
      })
      if (updated) this.options.onUpdated(updated)
      return updated
    }
    const existing = this.options.downloads.get(id)
    if (!existing) return null
    if (existing.status !== 'progressing') return existing
    const updated = this.options.downloads.update(id, {
      status: 'cancelled',
      endedAt: Date.now(),
      error: null
    })
    if (updated) this.options.onUpdated(updated)
    return updated
  }

  async open(id: string): Promise<boolean> {
    const record = this.options.downloads.get(id)
    if (!record?.path) return false
    if (!existsSync(record.path)) return false
    const error = await shell.openPath(record.path)
    if (error) {
      logger.warn('could not open download', { id, error })
      return false
    }
    return true
  }

  reveal(id: string): boolean {
    const record = this.options.downloads.get(id)
    if (!record?.path) return false
    if (!existsSync(record.path)) return false
    shell.showItemInFolder(record.path)
    return true
  }

  clear(id?: string): number {
    if (id) {
      const removed = this.options.downloads.remove(id)
      if (removed) this.options.onRemoved(id)
      return removed ? 1 : 0
    }
    const count = this.options.downloads.clear()
    this.options.onRemoved('*')
    return count
  }

  async chooseDirectory(parentWindow: Electron.BrowserWindow | null): Promise<string | null> {
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, {
          title: 'Choose download folder',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: 'Choose download folder',
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }
}

/** Removes path separators and reserved characters from a download filename. */
export function sanitizeFilename(name: string): string {
  const base = basename(name.replace(/\\/g, '/'))
  const cleaned = base
    .replace(/[<>:"|?*]/g, '_')
    // Control characters are removed so that a crafted file name cannot inject
    // shell or path separators.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
  if (!cleaned) {
    throw new AppError(ERROR_CODES.INVALID_ARGUMENT, 'The download has no usable file name.')
  }
  return cleaned.slice(0, 180)
}

function ensureDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
}

/**
 * Returns a path that does not overwrite an existing file.
 *
 * Chrome never replaces an earlier download silently; it appends " (1)",
 * " (2)" and so on. The same rule keeps two `resume.pdf` files from different
 * sites from destroying each other.
 */
export function resolveSavePath(directory: string, filename: string): string {
  const candidate = join(directory, filename)
  if (!existsSync(candidate)) return candidate

  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const extension = dot > 0 ? filename.slice(dot) : ''
  for (let index = 1; index < 1000; index += 1) {
    const next = join(directory, `${stem} (${index})${extension}`)
    if (!existsSync(next)) return next
  }
  return join(directory, `${stem}-${Date.now()}${extension}`)
}

function appDownloadsDirectory(): string {
  return join(app.getPath('downloads'))
}
