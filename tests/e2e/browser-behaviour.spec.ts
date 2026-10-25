import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  closeApp,
  launchApp,
  removeProfile,
  startLocalServer,
  waitForShell,
  type LaunchedApp
} from './helpers'

/**
 * Regression tests for behaviour that depends on a real Chromium session.
 *
 * Each test starts from a pristine temporary profile, so the browser data of
 * the person running the suite is never touched.
 */

const PAGE = '<html><head><title>Behaviour</title></head><body><h1>page</h1></body></html>'

/** A tiny but valid enough PDF payload; the download only has to be byte-exact. */
const PDF_BYTES = Buffer.from('%PDF-1.4\n%Nexus test document\n%%EOF\n', 'latin1')

/** Serves a PDF with the headers a portfolio "Download CV" button would use. */
function servePdf(response: import('node:http').ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': String(PDF_BYTES.byteLength)
  })
  response.end(PDF_BYTES)
}

/** Runs JavaScript inside the website view that shows the given origin. */
async function runInView(
  session: LaunchedApp,
  origin: string,
  code: string,
  userGesture = false
): Promise<unknown> {
  return session.app.evaluate(
    async ({ BrowserWindow }, args) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return null
      for (const child of win.contentView.children) {
        const contents = (child as { webContents?: Electron.WebContents }).webContents
        if (!contents || contents.isDestroyed()) continue
        if (!contents.getURL().startsWith(args.origin)) continue
        try {
          return await contents.executeJavaScript(args.code, args.userGesture)
        } catch (error) {
          return `error: ${(error as Error).message}`
        }
      }
      return 'no-view'
    },
    { origin, code, userGesture }
  )
}

/**
 * Clicks an element of the page with a trusted mouse event.
 *
 * A real click matters for downloads: Chromium blocks more than one download
 * per page when the page never received a user gesture. The event is also
 * safer than `executeJavaScript` when the click closes the tab it runs in.
 */
async function clickInView(session: LaunchedApp, origin: string, selector: string): Promise<void> {
  const point = await session.app.evaluate(
    async ({ BrowserWindow }, args) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return null
      for (const child of win.contentView.children) {
        const contents = (child as { webContents?: Electron.WebContents }).webContents
        if (!contents || contents.isDestroyed()) continue
        if (!contents.getURL().startsWith(args.origin)) continue
        const target = (await contents.executeJavaScript(
          `(() => {
            const element = document.querySelector(${JSON.stringify(args.selector)})
            if (!element) return null
            element.scrollIntoView({ block: 'center' })
            const rect = element.getBoundingClientRect()
            return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
          })()`
        )) as { x: number; y: number } | null
        if (!target) return null
        contents.sendInputEvent({
          type: 'mouseDown',
          x: target.x,
          y: target.y,
          button: 'left',
          clickCount: 1
        })
        contents.sendInputEvent({
          type: 'mouseUp',
          x: target.x,
          y: target.y,
          button: 'left',
          clickCount: 1
        })
        return target
      }
      return null
    },
    { origin, selector }
  )
  expect(point).not.toBeNull()
}

/** Waits until the active tab has a website view attached to the window. */
async function waitForView(session: LaunchedApp, origin: string): Promise<void> {
  await expect
    .poll(
      async () =>
        session.app.evaluate(async ({ BrowserWindow }, prefix) => {
          const win = BrowserWindow.getAllWindows()[0]
          if (!win) return false
          return win.contentView.children.some((child) => {
            const contents = (child as { webContents?: Electron.WebContents }).webContents
            return Boolean(
              contents && !contents.isDestroyed() && contents.getURL().startsWith(prefix)
            )
          })
        }, origin),
      { timeout: 15_000 }
    )
    .toBe(true)
}

test.describe('browser behaviour', () => {
  let session: LaunchedApp

  test.beforeAll(async () => {
    session = await launchApp()
    await waitForShell(session.page)
  })

  test.afterAll(async () => {
    await closeApp(session)
  })

  test('a download is recorded and written to disk', async () => {
    const { page } = session
    const directory = mkdtempSync(join(tmpdir(), 'nexus-downloads-'))
    const server = await startLocalServer({
      '/file': (_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="nexus-download.txt"'
        })
        response.end('download payload')
      }
    })

    try {
      await page.evaluate(
        (target) => window.nexus.settings.set({ downloadDirectory: target }),
        directory
      )
      const tabId = await page.evaluate(
        (url) => window.nexus.tabs.create({ url }).then((tab) => tab.id),
        `${server.origin}/file`
      )
      expect(tabId).toBeTruthy()

      // Wait for the transfer to finish, not just for the row to appear.
      await expect
        .poll(
          async () =>
            page.evaluate(() =>
              window.nexus.downloads.list().then((records) => records[0]?.status ?? 'missing')
            ),
          { timeout: 20_000 }
        )
        .toBe('completed')

      const [record] = await page.evaluate(() => window.nexus.downloads.list())
      expect(record?.filename).toBe('nexus-download.txt')
      expect(record?.status).toBe('completed')
      expect(record?.receivedBytes).toBeGreaterThan(0)

      // The file must really exist in the configured directory.
      const path = join(directory, 'nexus-download.txt')
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, 'utf8')).toBe('download payload')
    } finally {
      await page.evaluate(() => window.nexus.settings.set({ downloadDirectory: null }))
      await server.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('a website permission request reaches the shell', async () => {
    const { page } = session
    const server = await startLocalServer({ '/': PAGE })

    try {
      // Listen before the page asks, so nothing can be missed.
      await page.evaluate(() => {
        const state = globalThis as unknown as {
          __permissions: { requestId: string; permission: string; origin: string }[]
        }
        state.__permissions = []
        window.nexus.on('permission:requested', (request) => {
          state.__permissions.push({
            requestId: request.requestId,
            permission: request.permission,
            origin: request.origin
          })
        })
      })

      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/`)
      await waitForView(session, server.origin)

      await runInView(
        session,
        server.origin,
        // The promise only settles once the permission is answered, so it is
        // deliberately not awaited here: the assertion below observes the
        // request that it produces.
        'Notification.requestPermission().then(() => {}).catch(() => {}); 0'
      )

      await expect
        .poll(
          async () =>
            page.evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __permissions: { requestId: string; permission: string; origin: string }[]
                  }
                ).__permissions.length
            ),
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0)

      const [request] = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __permissions: { requestId: string; permission: string; origin: string }[]
            }
          ).__permissions
      )
      expect(request?.permission).toBe('notifications')
      expect(request?.origin).toBe(server.origin)

      // Answer the request so that the pending Chromium callback is released.
      const answered = await page.evaluate(
        (id) => window.nexus.permissions.respond(id, false),
        request!.requestId
      )
      expect(answered.resolved).toBe(true)
    } finally {
      await server.close()
    }
  })

  test('third-party cookies can be blocked from the settings', async () => {
    const { page } = session

    const site = await startLocalServer({
      '/third': (_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
          'Set-Cookie': 'third_party=yes; Path=/; Max-Age=86400'
        })
        response.end('<html><body>site</body></html>')
      }
    })
    // Every phase loads the frame from a fresh URL, so the request is never
    // answered from the HTTP cache and the cookie header is always processed.
    let phase = 0
    const embedder = await startLocalServer({
      '/embed': (_request, response) => {
        phase += 1
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
        response.end(
          `<html><body><iframe src="${site.origin}/third?phase=${phase}"></iframe></body></html>`
        )
      }
    })

    const storedCookies = async (): Promise<string[]> =>
      session.app.evaluate(async ({ session: electronSession }) =>
        electronSession.defaultSession.cookies.get({}).then((cookies) => cookies.map((c) => c.name))
      )
    const clearCookies = async (): Promise<void> => {
      await session.app.evaluate(async ({ session: electronSession }) =>
        electronSession.defaultSession.clearStorageData({ storages: ['cookies'] })
      )
    }
    const reloadEmbedder = async (): Promise<void> => {
      await page.evaluate(
        (origin) =>
          window.nexus.tabs.list().then((tabs) => {
            const tab = tabs.find((item) => item.url.startsWith(origin))
            return tab ? window.nexus.nav.reload(tab.id) : null
          }),
        embedder.origin
      )
    }

    try {
      // The browser allows third-party cookies by default.
      await clearCookies()
      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${embedder.origin}/embed`)
      await waitForView(session, embedder.origin)
      await expect.poll(storedCookies, { timeout: 15_000 }).toContain('third_party')

      // Blocking them must stop the cookie from being stored again.
      await page.evaluate(() => window.nexus.settings.set({ blockThirdPartyCookies: true }))
      await clearCookies()
      await reloadEmbedder()
      await expect.poll(storedCookies, { timeout: 15_000 }).not.toContain('third_party')

      // Turning the setting off restores the default behaviour.
      await page.evaluate(() => window.nexus.settings.set({ blockThirdPartyCookies: false }))
      await clearCookies()
      await reloadEmbedder()
      await expect.poll(storedCookies, { timeout: 15_000 }).toContain('third_party')
    } finally {
      await site.close()
      await embedder.close()
    }
  })
})

/**
 * The PDF tests run in their own application instances.
 *
 * A download test exercises the real download stack and can crash or hang the
 * application if it regresses; isolating them keeps one broken download
 * scenario from taking the other regression tests with it.
 */
test.describe('PDF downloads', () => {
  let session: LaunchedApp

  test.beforeEach(async () => {
    session = await launchApp()
    await waitForShell(session.page)
  })

  test.afterEach(async () => {
    await closeApp(session)
  })

  test('a PDF link downloads the file instead of opening a blank tab', async () => {
    const { page } = session
    const directory = mkdtempSync(join(tmpdir(), 'nexus-pdf-'))
    const server = await startLocalServer({
      '/portfolio':
        '<html><head><title>Portfolio</title></head><body>' +
        '<a id="cv" href="/files/cv.pdf">Download CV</a>' +
        '</body></html>',
      '/files/cv.pdf': (_request, response) => servePdf(response)
    })

    const completedDownloads = async (): Promise<string[]> =>
      page.evaluate(() =>
        window.nexus.downloads
          .list()
          .then((records) =>
            records
              .filter((record) => record.status === 'completed')
              .map((record) => record.filename)
          )
      )

    try {
      await page.evaluate(
        (target) => window.nexus.settings.set({ downloadDirectory: target }),
        directory
      )
      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/portfolio`)
      await waitForView(session, server.origin)

      await clickInView(session, server.origin, '#cv')

      await expect.poll(completedDownloads, { timeout: 20_000 }).toContain('cv.pdf')

      const path = join(directory, 'cv.pdf')
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path).equals(PDF_BYTES)).toBe(true)

      // The page must still be on screen: the download must not leave the tab
      // on the empty document that Chromium commits at the file URL.
      await expect
        .poll(
          async () =>
            runInView(
              session,
              server.origin,
              'document.querySelector("#cv") ? "present" : "missing"'
            ),
          { timeout: 10_000 }
        )
        .toBe('present')

      // The page must stay where it was: no blank document, no error page and
      // no tab that shows the PDF URL.
      const tabs = await page.evaluate(() => window.nexus.tabs.list())
      const portfolioTab = tabs.find((tab) => tab.url === `${server.origin}/portfolio`)
      expect(portfolioTab).toBeTruthy()
      expect(portfolioTab?.status).toBe('idle')
      expect(portfolioTab?.error).toBeNull()
      expect(portfolioTab?.pendingUrl).toBeNull()
      expect(tabs.some((tab) => tab.url.includes('/files/cv.pdf'))).toBe(false)

      // A second click must download again instead of being swallowed and must
      // not overwrite the first file.
      await clickInView(session, server.origin, '#cv')
      await expect
        .poll(
          async () =>
            page.evaluate(() =>
              window.nexus.downloads
                .list()
                .then(
                  (records) =>
                    records.filter(
                      (record) => record.filename === 'cv.pdf' && record.status === 'completed'
                    ).length
                )
            ),
          { timeout: 20_000 }
        )
        .toBe(2)
      expect(existsSync(join(directory, 'cv (1).pdf'))).toBe(true)
    } finally {
      await page.evaluate(() => window.nexus.settings.set({ downloadDirectory: null }))
      await server.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('a PDF that is served as an attachment is downloaded as well', async () => {
    const { page } = session
    const directory = mkdtempSync(join(tmpdir(), 'nexus-pdf-attachment-'))
    const server = await startLocalServer({
      '/portfolio':
        '<html><head><title>Portfolio</title></head><body>' +
        '<a id="cv" href="/files/cv-attachment.pdf">Download CV</a></body></html>',
      '/files/cv-attachment.pdf': (_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': String(PDF_BYTES.byteLength),
          'Content-Disposition': 'attachment; filename="cv-attachment.pdf"'
        })
        response.end(PDF_BYTES)
      }
    })

    try {
      await page.evaluate(
        (target) => window.nexus.settings.set({ downloadDirectory: target }),
        directory
      )
      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/portfolio`)
      await waitForView(session, server.origin)
      await clickInView(session, server.origin, '#cv')

      await expect
        .poll(
          async () =>
            page.evaluate(() =>
              window.nexus.downloads
                .list()
                .then((records) => records.map((record) => `${record.filename}:${record.status}`))
            ),
          { timeout: 20_000 }
        )
        .toContain('cv-attachment.pdf:completed')

      expect(readFileSync(join(directory, 'cv-attachment.pdf')).equals(PDF_BYTES)).toBe(true)

      // The page must still be displayed and must not be in an error state.
      const tabs = await page.evaluate(() => window.nexus.tabs.list())
      const portfolioTab = tabs.find((tab) => tab.url === `${server.origin}/portfolio`)
      expect(portfolioTab?.status).toBe('idle')
      expect(portfolioTab?.error).toBeNull()
    } finally {
      await page.evaluate(() => window.nexus.settings.set({ downloadDirectory: null }))
      await server.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('a PDF opened in a new tab is downloaded and the empty tab is closed', async () => {
    const { page } = session
    const directory = mkdtempSync(join(tmpdir(), 'nexus-pdf-blank-'))
    const server = await startLocalServer({
      '/portfolio':
        '<html><head><title>Portfolio</title></head><body>' +
        '<a id="cv" href="/files/cv-new-tab.pdf" target="_blank">Download CV</a></body></html>',
      '/files/cv-new-tab.pdf': (_request, response) => servePdf(response)
    })

    try {
      await page.evaluate(
        (target) => window.nexus.settings.set({ downloadDirectory: target }),
        directory
      )
      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/portfolio`)
      await waitForView(session, server.origin)
      const tabCount = (await page.evaluate(() => window.nexus.tabs.list())).length

      await clickInView(session, server.origin, '#cv')

      await expect
        .poll(
          async () =>
            page.evaluate(() =>
              window.nexus.downloads
                .list()
                .then((records) => records.map((record) => `${record.filename}:${record.status}`))
            ),
          { timeout: 20_000 }
        )
        .toContain('cv-new-tab.pdf:completed')

      // The tab that was created for the link never shows anything, so it is
      // closed again — exactly like Chrome closes it after a download starts.
      await expect
        .poll(
          async () => page.evaluate(() => window.nexus.tabs.list().then((tabs) => tabs.length)),
          {
            timeout: 10_000
          }
        )
        .toBe(tabCount)

      const tabs = await page.evaluate(() => window.nexus.tabs.list())
      expect(tabs.some((tab) => tab.url.includes('/files/cv-new-tab.pdf'))).toBe(false)
      expect(existsSync(join(directory, 'cv-new-tab.pdf'))).toBe(true)
    } finally {
      await server.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('download notifications are shown unless they are switched off', async () => {
    const { page } = session
    const directory = mkdtempSync(join(tmpdir(), 'nexus-pdf-toast-'))
    const server = await startLocalServer({
      '/notify.pdf': (_request, response) => servePdf(response),
      '/silent.pdf': (_request, response) => servePdf(response)
    })

    const downloads = async (): Promise<string[]> =>
      page.evaluate(() =>
        window.nexus.downloads
          .list()
          .then((records) => records.map((record) => `${record.filename}:${record.status}`))
      )

    try {
      await page.evaluate(
        (target) => window.nexus.settings.set({ downloadDirectory: target }),
        directory
      )

      // The setting is on by default.
      const settingsTab = await page.evaluate(() =>
        window.nexus.tabs.create({ url: 'nexus://settings' })
      )
      const toggle = page.getByRole('switch', { name: 'Show download notifications' })
      await expect(toggle).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')

      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/notify.pdf`)
      await expect.poll(downloads, { timeout: 20_000 }).toContain('notify.pdf:completed')
      await expect(
        page.getByRole('status').filter({ hasText: 'Downloaded notify.pdf' })
      ).toBeVisible()

      // Switch the notifications off through the real settings control.
      await page.evaluate((id) => window.nexus.tabs.activate(id), settingsTab.id)
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')

      // Let the previous toast expire before checking that none appears.
      await expect(page.getByRole('status')).toHaveCount(0, { timeout: 10_000 })

      await page.evaluate((url) => window.nexus.tabs.create({ url }), `${server.origin}/silent.pdf`)
      await expect.poll(downloads, { timeout: 20_000 }).toContain('silent.pdf:completed')
      await page.waitForTimeout(700)
      await expect(page.getByRole('status')).toHaveCount(0)
    } finally {
      await page.evaluate(() => window.nexus.settings.set({ downloadDirectory: null }))
      await server.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('deleting a workspace closes its tabs and keeps the browser usable', async () => {
    const { page } = session
    const server = await startLocalServer({ '/': PAGE })

    try {
      const workspace = await page.evaluate(() =>
        window.nexus.workspaces.create({ name: 'Doomed workspace' })
      )
      await page.evaluate((id) => window.nexus.workspaces.activate(id), workspace.id)

      const tab = await page.evaluate(
        (url) => window.nexus.tabs.create({ url }),
        `${server.origin}/`
      )
      expect(tab.workspaceId).toBe(workspace.id)

      const result = await page.evaluate((id) => window.nexus.workspaces.remove(id), workspace.id)
      expect(result.deleted).toBe(true)

      // The tab belonged to the removed workspace and must be gone.
      await expect
        .poll(async () =>
          page.evaluate(
            (id) => window.nexus.tabs.list().then((tabs) => tabs.some((t) => t.id === id)),
            tab.id
          )
        )
        .toBe(false)

      // No window may keep pointing at the deleted workspace: creating a tab
      // would fail with a foreign key error.
      const after = await page.evaluate(
        (url) => window.nexus.tabs.create({ url }),
        `${server.origin}/`
      )
      expect(after.id).toBeTruthy()

      const workspaces = await page.evaluate(() => window.nexus.workspaces.list())
      expect(workspaces.some((item) => item.id === after.workspaceId)).toBe(true)
    } finally {
      await server.close()
    }
  })
})

test.describe('session persistence', () => {
  test('cookies and website data survive a restart', async () => {
    const server = await startLocalServer({
      '/set-cookie': (_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': 'nexus_persistence=yes; Path=/; Max-Age=86400'
        })
        response.end('<html><head><title>Cookie</title></head><body>ok</body></html>')
      }
    })

    let profile: string | null = null
    let first: LaunchedApp | null = null

    try {
      first = await launchApp()
      profile = first.userDataDir
      await waitForShell(first.page)

      // Website views must use the persistent default session, not a
      // throw-away in-memory one. A null storage path means nothing is written
      // to disk and every login would be lost on exit.
      await first.page.evaluate(
        (url) => window.nexus.tabs.create({ url }),
        `${server.origin}/set-cookie`
      )
      await waitForView(first, server.origin)

      await expect
        .poll(
          async () =>
            first!.app.evaluate(async ({ session: electronSession }) => {
              const path = electronSession.defaultSession.getStoragePath?.() ?? null
              const cookies = await electronSession.defaultSession.cookies.get({})
              return { path, cookies: cookies.map((cookie) => cookie.name) }
            }),
          { timeout: 15_000 }
        )
        .toEqual({
          path: expect.any(String),
          cookies: expect.arrayContaining(['nexus_persistence'])
        })

      await closeApp(first, true)
      first = null

      // Restart against the very same profile.
      const second = await launchApp(profile)
      try {
        await waitForShell(second.page)
        const cookies = await second.app.evaluate(async ({ session: electronSession }) =>
          electronSession.defaultSession.cookies.get({})
        )
        expect(cookies.map((cookie) => cookie.name)).toContain('nexus_persistence')
      } finally {
        await closeApp(second)
        profile = null
      }
    } finally {
      if (first) await closeApp(first, true)
      if (profile) removeProfile(profile)
      await server.close()
    }
  })
})
