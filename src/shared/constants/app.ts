/**
 * Application-wide constants shared by the main, preload and renderer processes.
 */

export const APP_NAME = 'Nexus Browser'
export const APP_ID = 'com.nexusbrowser.desktop'
export const APP_VERSION = '1.0.0'

/**
 * Session partition used for regular (non-private) browsing.
 *
 * The string `default` maps onto Electron's default session, which is the
 * persistent session that stores cookies, cache and site storage for
 * ordinary browsing.
 */
export const DEFAULT_PARTITION = 'default'

/**
 * Session partition used for private browsing windows.
 *
 * The partition name has no `persist:` prefix, therefore Electron keeps the
 * session in memory only and discards it when the application exits.
 */
export const PRIVATE_PARTITION = 'nexus-private'

/**
 * Session partition used by the privileged application shell.
 *
 * The shell never talks to the network, so it is kept in its own partition to
 * make sure that no website can influence the state of the user interface.
 */
export const SHELL_PARTITION = 'persist:nexus-shell'

/** Session partition used by the application shell of a private window. */
export const PRIVATE_SHELL_PARTITION = 'nexus-shell-private'

/** Minimum window dimensions (content + frame). */
export const MIN_WINDOW_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 600
export const DEFAULT_WINDOW_WIDTH = 1440
export const DEFAULT_WINDOW_HEIGHT = 900

/** Renderer URL used by the application shell (Vite dev server or packaged file). */
export const INTERNAL_APP_SCHEME = 'nexus'

/** Maximum number of characters of page context sent to an AI provider. */
export const MAX_AI_CONTEXT_CHARS = 24_000

/** Maximum number of characters of user supplied context. */
export const MAX_AI_USER_INPUT_CHARS = 8_000

/** Maximum size (bytes) accepted when importing a bookmarks/collection file. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** Default timeout for HTTP requests issued by the developer API client. */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000

/** Maximum response size (bytes) buffered by the developer API client. */
export const MAX_HTTP_RESPONSE_BYTES = 10 * 1024 * 1024

/** Zoom factor boundaries applied to website contents. */
export const MIN_ZOOM_FACTOR = 0.25
export const MAX_ZOOM_FACTOR = 3
export const ZOOM_STEP = 0.1

/** Default home page (Nexus start page) — resolved against the internal scheme. */
export const START_PAGE_ROUTE = 'nexus://start'

/**
 * Internal pages rendered by the application shell instead of a website view.
 * The map is the single source of truth for their tab titles.
 */
export const INTERNAL_PAGE_TITLES: Record<string, string> = {
  'nexus://start': 'New Tab',
  'nexus://bookmarks': 'Bookmarks',
  'nexus://history': 'History',
  'nexus://downloads': 'Downloads',
  'nexus://workspaces': 'Workspaces',
  'nexus://ai': 'AI Assistant',
  'nexus://dev': 'Developer Tools',
  'nexus://settings': 'Settings',
  'nexus://onboarding': 'Welcome to Nexus'
}

/** Returns the tab title for an internal page route. */
export function internalPageTitle(route: string): string {
  return INTERNAL_PAGE_TITLES[route] ?? 'Nexus'
}

/** Favicon / placeholder used when a site does not provide an icon. */
export const DEFAULT_FAVICON = 'nexus://icon/placeholder'
