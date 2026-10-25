import { PageShell } from './PageShell'
import { BookmarksPanel } from '../panels/BookmarksPanel'

export function BookmarksPage(): React.JSX.Element {
  return (
    <PageShell title="Bookmarks" subtitle="Stored locally in the Nexus database." flush>
      <div className="h-full">
        <BookmarksPanel />
      </div>
    </PageShell>
  )
}
