import { StartPage } from './pages/StartPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { HistoryPage } from './pages/HistoryPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { WorkspacesPage } from './pages/WorkspacesPage'
import { SettingsPage } from './pages/SettingsPage'
import { DevPage } from './pages/DevPage'
import { AiPage } from './pages/AiPage'
import { OnboardingPage } from './pages/OnboardingPage'

/**
 * Renders an internal `nexus://` page.
 *
 * Internal pages are rendered by React inside the content area; websites are
 * rendered by real Chromium views. The route is normalised so that query
 * parameters do not break the lookup.
 */
export function InternalPage({ route }: { route: string }): React.JSX.Element {
  const path = route.split('?')[0]!.split('#')[0]!.toLowerCase()

  switch (path) {
    case 'nexus://start':
      return <StartPage />
    case 'nexus://bookmarks':
      return <BookmarksPage />
    case 'nexus://history':
      return <HistoryPage />
    case 'nexus://downloads':
      return <DownloadsPage />
    case 'nexus://workspaces':
      return <WorkspacesPage />
    case 'nexus://settings':
      return <SettingsPage />
    case 'nexus://dev':
      return <DevPage />
    case 'nexus://ai':
      return <AiPage />
    case 'nexus://onboarding':
      return <OnboardingPage />
    default:
      return <StartPage />
  }
}
