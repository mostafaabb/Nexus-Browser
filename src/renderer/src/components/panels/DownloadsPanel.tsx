import { useEffect } from 'react'
import { Download, FolderOpen, Trash, X } from 'lucide-react'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { Button, IconButton } from '../ui/Button'
import { EmptyState, Badge } from '../ui/Feedback'
import { formatBytes, formatRelativeTime } from '../../lib/format'

export function DownloadsPanel(): React.JSX.Element {
  const downloads = useAppStore((state) => state.downloads)
  const setDownloads = useAppStore((state) => state.setDownloads)
  const pushToast = useAppStore((state) => state.pushToast)

  useEffect(() => {
    void nexus.downloads
      .list()
      .then(setDownloads)
      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
  }, [setDownloads, pushToast])

  const active = downloads.filter((item) => item.status === 'progressing')
  const finished = downloads.filter((item) => item.status !== 'progressing')

  const renderItem = (item: (typeof downloads)[number]): React.JSX.Element => {
    const percent =
      item.totalBytes && item.totalBytes > 0
        ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
        : null
    return (
      <li key={item.id} className="rounded-md border border-line bg-surface-2 p-2.5">
        <div className="flex items-start gap-2">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-ink" title={item.filename}>
              {item.filename}
            </p>
            <p className="truncate text-[11px] text-ink-subtle" title={item.url}>
              {item.url}
            </p>
          </div>
          <Badge
            tone={
              item.status === 'completed'
                ? 'success'
                : item.status === 'progressing'
                  ? 'accent'
                  : item.status === 'failed'
                    ? 'danger'
                    : 'neutral'
            }
          >
            {item.status}
          </Badge>
        </div>

        {item.status === 'progressing' ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent ?? 30}%` }}
            />
          </div>
        ) : null}

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-ink-subtle">
            {formatBytes(item.receivedBytes)}
            {item.totalBytes ? ` / ${formatBytes(item.totalBytes)}` : ''}
            {item.endedAt ? ` · ${formatRelativeTime(item.endedAt)}` : ''}
          </span>
          <span className="flex-1" />
          {item.status === 'progressing' ? (
            <IconButton
              label="Cancel the download"
              size="sm"
              onClick={() => {
                void nexus.downloads.cancel(item.id).catch((error: unknown) => {
                  pushToast(errorMessage(error), 'error')
                })
              }}
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {item.path ? (
            <>
              <IconButton
                label="Open the file"
                size="sm"
                onClick={() => {
                  void nexus.downloads.open(item.id)
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Show the file in the explorer"
                size="sm"
                onClick={() => {
                  void nexus.downloads.reveal(item.id)
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label="Remove the download from the list"
            size="sm"
            onClick={() => {
              void nexus.downloads.clear(item.id)
            }}
          >
            <Trash className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        {item.error ? <p className="mt-1 text-[11px] text-danger">{item.error}</p> : null}
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          Downloads
        </span>
        {downloads.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void nexus.downloads.clear()
            }}
          >
            Clear all
          </Button>
        ) : null}
      </div>

      <div className="nx-scroll min-h-0 flex-1 p-2">
        {downloads.length === 0 ? (
          <EmptyState
            icon={<Download className="h-7 w-7" />}
            title="No downloads yet"
            description="Files you download are tracked here and stored in your download folder."
          />
        ) : (
          <div className="space-y-3">
            {active.length > 0 ? (
              <section>
                <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                  In progress
                </h3>
                <ul className="space-y-2">{active.map(renderItem)}</ul>
              </section>
            ) : null}
            {finished.length > 0 ? (
              <section>
                <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Finished
                </h3>
                <ul className="space-y-2">{finished.map(renderItem)}</ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
