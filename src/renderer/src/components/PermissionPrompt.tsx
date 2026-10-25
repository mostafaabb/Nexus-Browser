import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { nexus, errorMessage } from '../lib/api'
import { useAppStore } from '../store/app-store'
import { Button, IconButton } from './ui/Button'

interface PendingRequest {
  requestId: string
  origin: string
  permission: string
  mediaTypes: string[]
}

const PERMISSION_LABELS: Record<string, string> = {
  media: 'use the camera or microphone',
  geolocation: 'know your location',
  notifications: 'show notifications',
  midi: 'use MIDI devices',
  midiSysex: 'use MIDI devices with system exclusive messages',
  pointerLock: 'capture the pointer',
  fullscreen: 'go fullscreen',
  openExternal: 'open an external application',
  'clipboard-read': 'read your clipboard',
  'display-capture': 'capture your screen',
  hid: 'use a HID device',
  serial: 'use a serial port',
  usb: 'use a USB device'
}

/**
 * A bar that asks the user to allow or block a privileged browser request.
 *
 * It lives in the application chrome — never above the content area — because
 * the website views are rendered natively on top of the renderer.
 *
 * Requests are queued instead of overwritten: a website may ask for several
 * permissions at once and every request must be answered, otherwise the page
 * would wait forever for a callback that never arrives.
 */
export function PermissionPrompt(): React.JSX.Element | null {
  const pushToast = useAppStore((state) => state.pushToast)
  const [queue, setQueue] = useState<PendingRequest[]>([])

  useEffect(() => {
    return nexus.on('permission:requested', (payload) => {
      setQueue((current) => {
        // A repeated event for the same request must not queue it twice.
        if (current.some((item) => item.requestId === payload.requestId)) return current
        return [
          ...current,
          {
            requestId: payload.requestId,
            origin: payload.origin,
            permission: payload.permission,
            mediaTypes: payload.mediaTypes
          }
        ]
      })
    })
  }, [])

  const request = queue[0] ?? null

  if (!request) return null

  const label = PERMISSION_LABELS[request.permission] ?? `use “${request.permission}”`

  const respond = async (allow: boolean, remember: boolean): Promise<void> => {
    // The prompt disappears immediately; the request is answered afterwards so
    // that a slow IPC round trip cannot block the user interface.
    setQueue((current) => current.filter((item) => item.requestId !== request.requestId))
    try {
      // The main process stores the decision when `remember` is set, so the
      // page is always answered exactly once.
      await nexus.permissions.respond(request.requestId, allow, remember)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-3">
      <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
        <span className="font-medium">{request.origin}</span> wants to {label}.
        {queue.length > 1 ? (
          <span className="ml-2 text-ink-subtle">({queue.length - 1} more pending)</span>
        ) : null}
      </p>
      <Button size="sm" variant="ghost" onClick={() => void respond(false, true)}>
        Block
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void respond(true, false)}>
        Allow once
      </Button>
      <Button size="sm" variant="primary" onClick={() => void respond(true, true)}>
        <ShieldCheck className="h-3.5 w-3.5" />
        Allow
      </Button>
      <IconButton label="Dismiss" size="sm" onClick={() => void respond(false, false)}>
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
