/**
 * Runtime validation schemas for data that crosses a trust boundary.
 * Every privileged IPC handler validates its payload with these schemas.
 */

import { z } from 'zod'
import { ERROR_CODES, AppError } from '../errors'

export const zUrl = z.url()

export const zHttpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])

export const zTabId = z.string().min(1).max(128)

export const zTabIdSchema = z.object({ tabId: zTabId })

export const zNavigateRequest = z.object({
  tabId: zTabId,
  url: z.string().min(1).max(4096)
})

export const zViewLayoutRequest = z.object({
  entries: z
    .array(
      z.object({
        tabId: zTabId,
        x: z.number().finite().min(-10_000).max(100_000),
        y: z.number().finite().min(-10_000).max(100_000),
        width: z.number().finite().min(0).max(100_000),
        height: z.number().finite().min(0).max(100_000)
      })
    )
    .max(8)
})

export const zCreateTabRequest = z.object({
  url: z.string().min(1).max(4096).optional(),
  workspaceId: z.string().min(1).max(128).optional(),
  activate: z.boolean().optional(),
  background: z.boolean().optional()
})

export const zOpenExternalRequest = z.object({
  url: z.string().min(1).max(4096)
})

export const zBookmarkRequest = z.object({
  title: z.string().min(1).max(512),
  url: z.string().min(1).max(4096),
  parentId: z.string().min(1).max(128).nullable().optional()
})

export const zBookmarkFolderRequest = z.object({
  title: z.string().min(1).max(512),
  parentId: z.string().min(1).max(128).nullable().optional()
})

export const zBookmarkUpdateRequest = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(512).optional(),
  url: z.string().min(1).max(4096).optional()
})

export const zBookmarkMoveRequest = z.object({
  id: z.string().min(1).max(128),
  parentId: z.string().min(1).max(128).nullable(),
  position: z.number().int().min(0).max(100_000)
})

export const zBookmarkReorderRequest = z.object({
  parentId: z.string().min(1).max(128).nullable(),
  orderedIds: z.array(z.string().min(1).max(128)).max(10_000)
})

export const zHistoryQueryRequest = z.object({
  search: z.string().max(512).optional(),
  range: z.enum(['all', 'hour', 'day', 'week', 'month']).optional(),
  limit: z.number().int().min(1).max(5_000).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional()
})

export const zHistoryRemoveRequest = z.object({
  ids: z.array(z.string().min(1).max(128)).max(5_000)
})

export const zHistoryClearRequest = z.object({
  range: z.enum(['all', 'hour', 'day', 'week', 'month']).optional()
})

export const zImportRequest = z.object({
  content: z.string().max(5 * 1024 * 1024),
  fileName: z.string().min(1).max(256)
})

export const zWorkspaceCreateRequest = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().min(1).max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  layout: z.enum(['single', 'split-vertical', 'split-horizontal']).optional()
})

export const zWorkspaceUpdateRequest = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(120).optional(),
  icon: z.string().min(1).max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  layout: z.enum(['single', 'split-vertical', 'split-horizontal']).optional()
})

export const zSettingsPatchRequest = z.object({
  patch: z.object({
    theme: z.enum(['dark', 'light', 'system']).optional(),
    accent: z.enum(['violet', 'cyan', 'blue', 'emerald', 'amber']).optional(),
    sidebarMode: z.enum(['icons', 'expanded', 'hidden']).optional(),
    showBookmarksBar: z.boolean().optional(),
    startupBehavior: z.enum(['new-tab', 'restore-session', 'continue-where-left']).optional(),
    defaultWorkspaceId: z.string().max(128).nullable().optional(),
    homePage: z.string().max(4096).optional(),
    searchEngineId: z.string().max(64).optional(),
    customSearchTemplate: z.string().max(2048).optional(),
    askWhereToSave: z.boolean().optional(),
    downloadDirectory: z.string().max(1024).nullable().optional(),
    showDownloadNotifications: z.boolean().optional(),
    recordHistory: z.boolean().optional(),
    clearHistoryOnExit: z.boolean().optional(),
    saveAiConversations: z.boolean().optional(),
    includePageContextByDefault: z.boolean().optional(),
    aiDefaultProvider: z.string().max(64).optional(),
    aiDefaultModel: z.string().max(200).optional(),
    aiTimeoutMs: z.number().int().min(1_000).max(600_000).optional(),
    httpDefaultTimeoutMs: z.number().int().min(1_000).max(600_000).optional(),
    editorFontSize: z.number().int().min(10).max(32).optional(),
    editorTabSize: z.number().int().min(1).max(8).optional(),
    reduceMotion: z.boolean().optional(),
    onboardingCompleted: z.boolean().optional(),
    zoomPerSite: z.boolean().optional(),
    blockThirdPartyCookies: z.boolean().optional()
  })
})

export const zPermissionSetRequest = z.object({
  origin: z.string().min(1).max(512),
  permission: z.string().min(1).max(64),
  decision: z.enum(['allow', 'deny', 'ask'])
})

export const zAiProviderConfigRequest = z.object({
  config: z.object({
    providerId: z.enum(['mock', 'openai-compatible']).optional(),
    displayName: z.string().max(120).optional(),
    endpoint: z.string().max(2048).optional(),
    model: z.string().max(200).optional(),
    timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    maxTokens: z.number().int().min(1).max(200_000).nullable().optional(),
    stream: z.boolean().optional(),
    extraHeaders: z.record(z.string(), z.string().max(2048)).optional()
  }),
  apiKey: z.string().max(4096).nullable().optional()
})

export const zAiSendRequest = z.object({
  conversationId: z.string().max(128).nullable(),
  prompt: z.string().min(1).max(32_000),
  actionId: z.string().max(64).nullable().optional(),
  context: z
    .array(
      z.object({
        kind: z.enum(['page', 'selection', 'tabs', 'comparison', 'pasted', 'reader']),
        label: z.string().max(512),
        url: z.string().max(4096).nullable(),
        title: z.string().max(1024).nullable(),
        text: z.string().max(200_000),
        characters: z.number().int().min(0),
        truncated: z.boolean()
      })
    )
    .max(32),
  providerId: z.string().max(64).optional()
})

export const zAiExtractContextRequest = z.object({
  tabIds: z.array(z.string().max(128)).max(16),
  includeSelection: z.boolean().optional(),
  includeReadable: z.boolean().optional()
})

export const zSnippetSaveRequest = z.object({
  id: z.string().max(128).optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(2_000).optional(),
  code: z.string().max(500_000),
  language: z.string().max(64),
  folderId: z.string().max(128).nullable().optional(),
  tags: z.array(z.string().max(64)).max(32).optional(),
  favorite: z.boolean().optional()
})

export const zApiRequestPayload = z.object({
  method: zHttpMethod,
  url: z.string().min(1).max(4096),
  query: z
    .array(
      z.object({
        id: z.string().max(64),
        key: z.string().max(512),
        value: z.string().max(8192),
        enabled: z.boolean()
      })
    )
    .max(200),
  headers: z
    .array(
      z.object({
        id: z.string().max(64),
        key: z.string().max(512),
        value: z.string().max(8192),
        enabled: z.boolean()
      })
    )
    .max(100),
  bodyType: z.enum(['none', 'json', 'text', 'form']),
  body: z.string().max(2_000_000),
  timeoutMs: z.number().int().min(1_000).max(600_000)
})

export const zApiRequestRecordRequest = z.object({
  id: z.string().max(128).optional(),
  record: z.object({
    collectionId: z.string().max(128).nullable(),
    name: z.string().min(1).max(300),
    method: zHttpMethod,
    url: z.string().min(1).max(4096),
    query: z
      .array(
        z.object({
          id: z.string().max(64),
          key: z.string().max(512),
          value: z.string().max(8192),
          enabled: z.boolean()
        })
      )
      .max(200),
    headers: z
      .array(
        z.object({
          id: z.string().max(64),
          key: z.string().max(512),
          value: z.string().max(8192),
          enabled: z.boolean()
        })
      )
      .max(100),
    bodyType: z.enum(['none', 'json', 'text', 'form']),
    body: z.string().max(2_000_000),
    notes: z.string().max(20_000)
  })
})

export const zFindInPageRequest = z.object({
  tabId: zTabId,
  query: z.string().max(1024),
  forward: z.boolean(),
  findNext: z.boolean()
})

/* ------------------------------------------------------------------------ */
/* Shared building blocks                                                     */
/* ------------------------------------------------------------------------ */

const zEntityId = z.string().min(1).max(128)
const zWorkspaceId = z.string().min(1).max(128)
const zHexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const zIdSchema = z.object({ id: zEntityId })

export const zPathRequest = z.object({
  path: z.string().min(1).max(4096)
})

export const zFileFilters = z
  .array(
    z.object({
      name: z.string().min(1).max(120),
      extensions: z.array(z.string().min(1).max(32)).max(32)
    })
  )
  .max(16)

export const zSaveTextFileRequest = z.object({
  content: z.string().max(10 * 1024 * 1024),
  fileName: z.string().min(1).max(256).optional(),
  filters: zFileFilters.optional()
})

export const zOpenTextFileRequest = z.object({
  filters: zFileFilters.optional()
})

export const zWindowTitleRequest = z.object({
  title: z.string().min(1).max(200)
})

export const zWindowThemeRequest = z.object({
  theme: z.enum(['dark', 'light'])
})

export const zTabIndexRequest = z.object({
  tabId: zTabId,
  toIndex: z.number().int().min(0).max(10_000)
})

export const zTabReloadRequest = z.object({
  tabId: zTabId,
  hard: z.boolean().optional()
})

export const zTabWorkspaceRequest = z.object({
  tabId: zTabId,
  workspaceId: zWorkspaceId
})

export const zTabPinnedRequest = z.object({
  tabId: zTabId,
  pinned: z.boolean()
})

export const zTabMutedRequest = z.object({
  tabId: zTabId,
  muted: z.boolean()
})

export const zTabIdsRequest = z.object({
  tabIds: z.array(zEntityId).max(1_000)
})

export const zWorkspaceIdRequest = z.object({
  workspaceId: zWorkspaceId
})

export const zGroupCreateRequest = z.object({
  workspaceId: zWorkspaceId.optional(),
  name: z.string().min(1).max(120),
  color: zHexColor.optional()
})

export const zGroupUpdateRequest = z.object({
  groupId: zEntityId,
  name: z.string().min(1).max(120).optional(),
  color: zHexColor.optional(),
  collapsed: z.boolean().optional()
})

export const zGroupIdRequest = z.object({
  groupId: zEntityId
})

export const zTabGroupAssignRequest = z.object({
  tabId: zTabId,
  groupId: zEntityId.nullable()
})

export const zOpenInNewTabRequest = z.object({
  url: z.string().min(1).max(4096),
  workspaceId: zWorkspaceId.optional()
})

export const zZoomRequest = z.object({
  tabId: zTabId,
  factor: z.number().finite().min(0.25).max(3)
})

export const zBookmarkSearchRequest = z.object({
  query: z.string().max(512)
})

export const zBookmarkExportRequest = z.object({
  format: z.enum(['json', 'html']).optional()
})

export const zWorkspaceIdsRequest = z.object({
  ids: z.array(zEntityId).max(1_000)
})

export const zSaveSessionRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  workspaceId: zWorkspaceId.optional()
})

export const zRenameSessionRequest = z.object({
  id: zEntityId,
  name: z.string().min(1).max(120)
})

export const zDownloadClearRequest = z.object({
  id: zEntityId.optional()
})

export const zClearBrowsingDataRequest = z.object({
  scope: z.enum(['all', 'history', 'downloads', 'cache', 'cookies']).optional()
})

export const zPermissionRespondRequest = z.object({
  requestId: zEntityId,
  allow: z.boolean(),
  /** When false the decision applies to this request only and is not stored. */
  remember: z.boolean().optional()
})

export const zAiConversationTitleRequest = z.object({
  title: z.string().min(1).max(300).optional()
})

export const zAiConversationIdRequest = z.object({
  conversationId: zEntityId
})

export const zAiRenameConversationRequest = z.object({
  id: zEntityId,
  title: z.string().min(1).max(300)
})

export const zNameRequest = z.object({
  name: z.string().min(1).max(120)
})

export const zSnippetListRequest = z.object({
  search: z.string().max(512).optional(),
  folderId: zEntityId.nullable().optional(),
  tag: z.string().max(64).optional()
})

export const zCollectionCreateRequest = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional()
})

export const zCollectionUpdateRequest = z.object({
  id: zEntityId,
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2_000).optional()
})

export const zRequestListRequest = z.object({
  collectionId: zEntityId.nullable().optional()
})

export const zRequestCancelRequest = z.object({
  requestId: zEntityId
})

/** Parses a payload or throws a serializable {@link AppError}. */
export function parsePayload<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      issue ? `${issue.path.join('.') || 'payload'}: ${issue.message}` : 'Invalid payload',
      { issues: result.error.issues.slice(0, 5) }
    )
  }
  return result.data
}
