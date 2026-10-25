/** Application settings types. */

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentColor = 'violet' | 'cyan' | 'blue' | 'emerald' | 'amber'
export type StartupBehavior = 'new-tab' | 'restore-session' | 'continue-where-left'
export type SidebarMode = 'icons' | 'expanded' | 'hidden'

export interface AppSettings {
  theme: ThemeMode
  accent: AccentColor
  sidebarMode: SidebarMode
  showBookmarksBar: boolean
  startupBehavior: StartupBehavior
  defaultWorkspaceId: string | null
  homePage: string
  searchEngineId: string
  customSearchTemplate: string
  askWhereToSave: boolean
  downloadDirectory: string | null
  showDownloadNotifications: boolean
  recordHistory: boolean
  clearHistoryOnExit: boolean
  saveAiConversations: boolean
  includePageContextByDefault: boolean
  aiDefaultProvider: string
  aiDefaultModel: string
  aiTimeoutMs: number
  httpDefaultTimeoutMs: number
  editorFontSize: number
  editorTabSize: number
  reduceMotion: boolean
  onboardingCompleted: boolean
  zoomPerSite: boolean
  blockThirdPartyCookies: boolean
}

export interface PermissionDecisionRecord {
  origin: string
  permission: string
  decision: 'allow' | 'deny' | 'ask'
  updatedAt: number
}

export type PermissionKind =
  | 'media'
  | 'geolocation'
  | 'notifications'
  | 'midi'
  | 'pointerLock'
  | 'fullscreen'
  | 'openExternal'
  | 'clipboardRead'
  | 'unknown'
