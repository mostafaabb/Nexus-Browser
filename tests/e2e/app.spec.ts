import { expect, test } from '@playwright/test'
import { closeApp, launchApp, startLocalServer, waitForShell, type LaunchedApp } from './helpers'

/**
 * Smoke tests that start the real application and verify that the shell, the
 * tab system and the internal pages work.
 *
 * These tests do not require network access: every page they open is served
 * by the application itself.
 */

let session: LaunchedApp

test.beforeAll(async () => {
  session = await launchApp()
  await waitForShell(session.page)
})

test.afterAll(async () => {
  await closeApp(session)
})

test('the shell renders and exposes the privileged bridge', async () => {
  const { page } = session
  await expect(page.getByPlaceholder('Search or enter an address')).toBeVisible()

  // The preload bridge must be installed and usable.
  const info = await page.evaluate(() => window.nexus.app.getInfo())
  expect(info.name).toBe('Nexus Browser')
  expect(info.electronVersion).toMatch(/^45\./)
  expect(info.isPackaged).toBe(false)
})

test('the start page is shown in the first tab', async () => {
  const { page } = session
  const start = page.locator('main').first()
  await expect(start).toBeVisible()
  // The start page renders a heading and quick links.
  await expect(start.getByRole('heading').first()).toBeVisible()
})

test('the new tab button creates a tab', async () => {
  const { page } = session
  const before = await page.evaluate(() => window.nexus.tabs.list().then((t) => t.length))

  await page.getByRole('button', { name: 'New tab', exact: true }).last().click()
  await expect
    .poll(async () => page.evaluate(() => window.nexus.tabs.list().then((t) => t.length)))
    .toBe(before + 1)
})

test('internal pages open in their own tab', async () => {
  const { page } = session
  await page.evaluate(() => window.nexus.tabs.create({ url: 'nexus://bookmarks' }))

  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.nexus.tabs.list().then((tabs) => tabs.some((tab) => tab.url === 'nexus://bookmarks'))
      )
    )
    .toBe(true)
})

test('the settings page is reachable and stores a value', async () => {
  const { page } = session
  await page.evaluate(() => window.nexus.tabs.create({ url: 'nexus://settings' }))

  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.nexus.tabs.list().then((tabs) => tabs.some((tab) => tab.url === 'nexus://settings'))
      )
    )
    .toBe(true)

  const before = await page.evaluate(() => window.nexus.settings.get())
  const changed = await page.evaluate(
    (value) => window.nexus.settings.set({ showBookmarksBar: value }),
    !before.showBookmarksBar
  )
  expect(changed.showBookmarksBar).toBe(!before.showBookmarksBar)

  // Restore the original value so that the test is repeatable.
  await page.evaluate(
    (value) => window.nexus.settings.set({ showBookmarksBar: value }),
    before.showBookmarksBar
  )
})

test('a search query is resolved to a search engine URL', async () => {
  const { page } = session
  const tabId = await page.evaluate(() =>
    window.nexus.tabs.list().then((tabs) => tabs[tabs.length - 1]!.id)
  )
  const url = await page.evaluate(
    (id) => window.nexus.nav.navigate(id, 'nexus browser test query').then((result) => result.url),
    tabId
  )
  expect(url).toMatch(/^https:\/\//)
  expect(url.toLowerCase()).toContain('nexus')
})

test('searching from an internal page opens a real website view', async () => {
  const { page, app } = session

  // An internal page is rendered by the application shell and has no Chromium
  // view of its own. Searching from it must still produce a website.
  await page.evaluate(() => window.nexus.tabs.create({ url: 'nexus://start' }))
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.nexus.tabs.list().then((tabs) => tabs.some((tab) => tab.url === 'nexus://start'))
      )
    )
    .toBe(true)

  const addressBar = page.getByPlaceholder('Search or enter an address')
  await addressBar.click()
  await addressBar.fill('nexus internal search test')
  await addressBar.press('Enter')

  // The tab must now point at a website ...
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.nexus.tabs.list().then((tabs) => {
          const tab = tabs.find((item) => item.isActive)
          return tab ? tab.url || tab.pendingUrl || '' : ''
        })
      )
    )
    .toMatch(/^https:\/\//)

  // ... and a native Chromium view must exist for it. The view is attached
  // by the layout synchronisation, which runs on the next animation frame,
  // so the check is polled.
  await expect
    .poll(
      async () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0]
          if (!win) return ''
          const urls: string[] = []
          for (const child of win.contentView.children) {
            const contents = (child as { webContents?: { getURL(): string } }).webContents
            if (contents) urls.push(contents.getURL())
          }
          return urls.find((url) => url.startsWith('https://')) ?? ''
        }),
      { timeout: 15000 }
    )
    .toMatch(/^https:\/\//)
})

test('blocked schemes are rejected by the navigation layer', async () => {
  const { page } = session
  const tabId = await page.evaluate(() =>
    window.nexus.tabs.list().then((tabs) => tabs[tabs.length - 1]!.id)
  )
  const result = await page.evaluate(
    (id) =>
      window.nexus.nav
        .navigate(id, 'javascript:alert(1)')
        .then(() => 'resolved')
        .catch((error: Error) => error.message),
    tabId
  )
  expect(result).not.toBe('resolved')
})

test('visiting a page records it in the browsing history', async () => {
  const { page } = session
  const server = await startLocalServer({
    '/history-probe': '<html><head><title>History Probe</title></head><body>ok</body></html>'
  })

  try {
    const addressBar = page.getByPlaceholder('Search or enter an address')
    await addressBar.click()
    await addressBar.fill(`${server.origin}/history-probe`)
    await addressBar.press('Enter')

    // The visit must end up in the local history store, with its title.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.nexus.history
              .query({ range: 'all', search: 'history-probe', limit: 50 })
              .then((entries) => entries.length)
          ),
        { timeout: 15000 }
      )
      .toBe(1)

    const entry = await page.evaluate(() =>
      window.nexus.history.query({ range: 'all', search: 'history-probe', limit: 50 })
    )
    expect(entry[0]?.url).toContain('/history-probe')
    expect(entry[0]?.title).toBe('History Probe')
    expect(entry[0]?.visitCount).toBe(1)
  } finally {
    await server.close()
  }
})

test('no renderer errors were reported', async () => {
  expect(session.errors).toEqual([])
})
