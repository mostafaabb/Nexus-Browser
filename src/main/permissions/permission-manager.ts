import { session } from 'electron'
import { DEFAULT_PARTITION, PRIVATE_PARTITION } from '@shared/constants/app'
import { getOrigin } from '@shared/navigation/url'
import type { PermissionsRepository } from '../database/repositories/permissions-repository'
import { createLogger } from '../utils/logger'

const logger = createLogger('permissions')

/** Permissions that Nexus never grants automatically. */
const SENSITIVE_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'pointerLock',
  'openExternal',
  'clipboard-read',
  'fullscreen',
  'display-capture',
  'hid',
  'serial',
  'usb'
])

export interface PendingRequest {
  id: string
  origin: string
  permission: string
  mediaTypes: string[]
  resolve: (allow: boolean) => void
  createdAt: number
}

export interface PermissionManagerOptions {
  permissions: PermissionsRepository
  /** Sends the permission prompt to the renderer that owns the website. */
  requestDecision: (request: PendingRequest) => void
}

/**
 * The union of the detail objects Electron passes to a permission request
 * handler. Only the fields that are common to all of them are used.
 */
type PermissionRequestDetails = Electron.PermissionRequest &
  Partial<Electron.MediaAccessPermissionRequest> &
  Partial<Electron.OpenExternalPermissionRequest>

/**
 * Enforces the website permission policy.
 *
 * Every sensitive permission is denied unless the user explicitly allowed it
 * for the requesting origin. Unknown permissions are denied outright.
 */
export class PermissionManager {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly options: PermissionManagerOptions
  private attached = new Set<string>()

  constructor(options: PermissionManagerOptions) {
    this.options = options
  }

  attach(): void {
    for (const partition of [DEFAULT_PARTITION, PRIVATE_PARTITION]) {
      const target =
        partition === DEFAULT_PARTITION ? session.defaultSession : session.fromPartition(partition)
      if (!target || this.attached.has(partition)) continue
      this.attached.add(partition)

      target.setPermissionRequestHandler((webContents, permission, callback, details) => {
        void this.handleRequest(webContents, permission, callback, details)
      })

      target.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        const origin = getOrigin(requestingOrigin) ?? requestingOrigin
        const decision = this.options.permissions.get(origin, permission)
        return decision?.decision === 'allow'
      })
    }
  }

  private async handleRequest(
    webContents: Electron.WebContents,
    permission: string,
    callback: (granted: boolean) => void,
    details: PermissionRequestDetails
  ): Promise<void> {
    const requestingUrl = details.requestingUrl || webContents.getURL()
    const origin = getOrigin(requestingUrl) ?? 'unknown://origin'

    if (!SENSITIVE_PERMISSIONS.has(permission)) {
      // Unknown/unsupported permissions are denied by default.
      callback(false)
      return
    }

    const stored = this.options.permissions.get(origin, permission)
    if (stored?.decision === 'allow') {
      callback(true)
      return
    }
    if (stored?.decision === 'deny') {
      callback(false)
      return
    }

    const id = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : []
    const request: PendingRequest = {
      id,
      origin,
      permission,
      mediaTypes,
      createdAt: Date.now(),
      resolve: (allow: boolean) => {
        callback(allow)
        this.pending.delete(id)
      }
    }
    this.pending.set(id, request)

    logger.info('permission requested', { origin, permission })
    this.options.requestDecision(request)
  }

  /**
   * Resolves a pending request from the user interface.
   *
   * When `remember` is false the decision applies to this request only and is
   * not written to the permission store, which is what the "Allow once"
   * button of the permission prompt uses.
   */
  respond(requestId: string, allow: boolean, remember = true): boolean {
    const request = this.pending.get(requestId)
    if (!request) return false
    if (remember) {
      this.options.permissions.set(request.origin, request.permission, allow ? 'allow' : 'deny')
    }
    request.resolve(allow)
    return true
  }

  /** Denies every request that is still pending (e.g. when a window closes). */
  denyAll(): void {
    for (const request of this.pending.values()) request.resolve(false)
    this.pending.clear()
  }
}
