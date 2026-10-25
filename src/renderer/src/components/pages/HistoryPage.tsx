import { PageShell } from './PageShell'
import { HistoryPanel } from '../panels/HistoryPanel'

export function HistoryPage(): React.JSX.Element {
  return (
    <PageShell title="History" subtitle="Browsing history recorded on this machine." flush>
      <div className="h-full">
        <HistoryPanel />
      </div>
    </PageShell>
  )
}
