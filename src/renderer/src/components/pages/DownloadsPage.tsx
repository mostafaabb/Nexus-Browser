import { PageShell } from './PageShell'
import { DownloadsPanel } from '../panels/DownloadsPanel'

export function DownloadsPage(): React.JSX.Element {
  return (
    <PageShell title="Downloads" subtitle="Files downloaded with this browser." flush>
      <div className="h-full">
        <DownloadsPanel />
      </div>
    </PageShell>
  )
}
