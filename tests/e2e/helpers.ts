import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * End-to-end tests that drive the real application.
 *
 * The tests launch the packaged main bundle with the real Electron binary,
 * so they exercise the complete stack: the main process, the preload bridge
 * and the renderer.
 */

/** Path of the Electron binary that ships with the `electron` package. */
function electronExecutable(): string {
  const dist = join(process.cwd(), 'node_modules', 'electron', 'dist')
  if (process.platform === 'win32') return join(dist, 'electron.exe')
  if (process.platform === 'darwin')
    return join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  return join(dist, 'electron')
}

export interface LaunchedApp {
  app: ElectronApplication
  /**
   * The application window.
   *
   * It is deliberately *not* called `window`: the callbacks that are passed to
   * `page.evaluate()` are serialised and executed inside the renderer, where
   * `window` must still refer to the DOM window and not to this object.
   */
  page: Page
  /** Console errors and page errors that were observed. */
  errors: string[]
  /** The temporary profile directory that isolates this run. */
  userDataDir: string
}

/**
 * Launches the application.
 *
 * @param existingProfile Reuse a profile directory instead of creating a fresh
 *   one. Used by the persistence test, which restarts the application against
 *   the same profile and expects the browsing data to survive.
 */
export async function launchApp(existingProfile?: string): Promise<LaunchedApp> {
  if (!existsSync(join(process.cwd(), 'out', 'main', 'index.js'))) {
    throw new Error(
      'The application was not built. Run "npm run build" before the end-to-end tests.'
    )
  }
  if (!existsSync(electronExecutable())) {
    throw new Error(
      'The Electron binary is missing. Run "npm install" before the end-to-end tests.'
    )
  }

  // Every run gets its own profile so that the tests never touch the
  // bookmarks, history or settings of the real user profile.
  const userDataDir = existingProfile ?? mkdtempSync(join(tmpdir(), 'nexus-e2e-'))

  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: [process.cwd(), `--user-data-dir=${userDataDir}`],
    cwd: process.cwd()
  })

  const errors: string[] = []
  app.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  app.on('window', (page) => {
    page.on('pageerror', (error) => errors.push(error.message))
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, errors, userDataDir }
}

/** Closes the application and removes its temporary profile. */
export async function closeApp(session: LaunchedApp, keepProfile = false): Promise<void> {
  await session.app.close()
  if (!keepProfile) rmSync(session.userDataDir, { recursive: true, force: true })
}

/** Removes a profile directory created by {@link launchApp}. */
export function removeProfile(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
}

export interface LocalServer {
  /** The origin the server listens on, for example `http://127.0.0.1:41234`. */
  origin: string
  close: () => Promise<void>
}

/**
 * A route is either a plain HTML body or a handler that writes its own
 * response. Handlers are needed for headers such as `Set-Cookie` and
 * `Content-Disposition`, which drive the download and cookie tests.
 */
export type LocalRoute = string | ((request: IncomingMessage, response: ServerResponse) => void)

/**
 * Starts a tiny HTTP server on the loopback interface.
 *
 * It lets the end-to-end tests load real web pages without depending on the
 * public internet, so the suite stays deterministic and offline.
 */
export async function startLocalServer(
  routes: Record<string, LocalRoute> = {
    '/': '<html><head><title>Local Test Page</title></head><body><h1>Local</h1></body></html>'
  }
): Promise<LocalServer> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/'
    const route = routes[path]

    if (typeof route === 'function') {
      route(request, response)
      return
    }

    response.writeHead(route === undefined ? 404 : 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    response.end(route ?? '<html><body>not found</body></html>')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}

/** Waits until the application shell has finished its start-up. */
export async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('[aria-label="Address and search bar"]', { timeout: 30_000 })
}
