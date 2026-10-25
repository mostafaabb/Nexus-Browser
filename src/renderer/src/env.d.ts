/// <reference types="vite/client" />

import type { NexusApi } from '@shared/contracts/api'

declare global {
  interface Window {
    /** Typed bridge to the privileged main process, injected by the preload. */
    nexus: NexusApi
  }
}

export {}
