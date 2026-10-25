# Testing

Nexus has an automated test suite that runs against the real implementations — a real
SQLite engine, the real URL parsing code, the real provider adapters and the real React
components. Nothing in the suite is mocked out except at the network boundary.

---

## 1. Running the tests

```bash
npm test                 # the whole Vitest suite
npm run test:watch       # watch mode
npm run test:coverage    # with V8 coverage
npm run test:e2e         # builds the app, then runs the Playwright suite
npm run verify           # typecheck → lint → test → test:e2e
```

Current status of the Vitest suite (measured on Node 22.15.0, Windows 11):

```
Test Files  19 passed (19)
     Tests  295 passed (295)
  Duration  ~25 s
```

| Suite | Files | Tests |
| --- | --- | --- |
| `tests/unit` | 6 | 132 |
| `tests/integration` | 7 | 79 |
| `tests/security` | 5 | 67 |
| `tests/component` | 1 | 17 |
| **Total** | **19** | **295** |

| Test file | Tests |
| --- | --- |
| `tests/unit/url.test.ts` | 54 |
| `tests/unit/schemas.test.ts` | 28 |
| `tests/unit/format.test.ts` | 24 |
| `tests/unit/search-engines.test.ts` | 11 |
| `tests/unit/viewport.test.ts` | 8 |
| `tests/unit/errors.test.ts` | 7 |
| `tests/integration/bookmarks.test.ts` | 16 |
| `tests/integration/workspaces.test.ts` | 13 |
| `tests/integration/snippets.test.ts` | 12 |
| `tests/integration/history.test.ts` | 12 |
| `tests/integration/settings.test.ts` | 11 |
| `tests/integration/database.test.ts` | 9 |
| `tests/integration/cookie-policy.test.ts` | 6 |
| `tests/security/navigation.test.ts` | 33 |
| `tests/security/ai-provider.test.ts` | 11 |
| `tests/security/ipc-contract.test.ts` | 10 |
| `tests/security/download-filename.test.ts` | 8 |
| `tests/security/download-save-path.test.ts` | 5 |
| `tests/component/ui.test.tsx` | 17 |

The end-to-end suite adds **19** more tests (`npm run test:e2e`), so the whole
repository contains **314** automated tests.

---

## 2. Test layout

```
tests/
  setup/
    vitest.setup.ts        global setup (jsdom shims, window.nexus stub, cleanup)
  unit/                    pure logic, no I/O
    url.test.ts            navigation parsing and the scheme allow list
    schemas.test.ts        every Zod schema used at the IPC boundary
    errors.test.ts         AppError and error serialisation
    search-engines.test.ts search engine definitions and URL building
    format.test.ts         formatting helpers
    viewport.test.ts       pane computation for the split view
  integration/             the real SQLite engine on a temporary file
    database.test.ts       bootstrap, migrations, transactions, backup, errors
    bookmarks.test.ts      bookmark tree, reordering, search, import/export
    history.test.ts        visit recording, queries, clearing
    cookie-policy.test.ts  third-party cookie filtering
    workspaces.test.ts     workspaces, workspace tabs, tab groups
    settings.test.ts       settings and permission decisions
    snippets.test.ts       snippet library and AI conversations
  security/                hardening regression tests
    navigation.test.ts     protocol blocking, control-character smuggling
    ipc-contract.test.ts   the shape of the privileged surface
    ai-provider.test.ts    provider hardening and mock labelling
    download-filename.test.ts  filename sanitisation
    download-save-path.test.ts  unique file names (no silent overwrite)
  component/               jsdom + React Testing Library
    ui.test.tsx            the UI primitives
  e2e/                     Playwright, drives the real Electron application
    helpers.ts             launches the built application and collects errors
    app.spec.ts            shell, tab system, internal pages, navigation policy
    browser-behaviour.spec.ts
                           downloads, permissions, third-party cookies,
                           workspace deletion, session persistence
    browser-behaviour.spec.ts (PDF downloads)
                           PDF links download instead of leaving a blank tab,
                           downloads in a new tab, repeat downloads, toasts
```

---

## 3. What each suite proves

### 3.1 Unit — pure logic

These tests have no I/O and run in milliseconds. They cover the code where a subtle
bug would be hard to spot later.

**`tests/unit/url.test.ts` (54 tests)** — the security-critical navigation parser.

- `https://example.com/docs?a=1` resolves to a URL.
- `example.com` → `https://example.com/`, `example.com/a/b` → `https://example.com/a/b`.
- `example.com:8443/path` → `https://example.com:8443/path`.
- `localhost:5173` and `127.0.0.1:8080` → `http://…`.
- `how to bake bread` → a search query, not a URL.
- `javascript:alert(1)`, `file:///…`, `data:text/html,…` → invalid.
- Control characters anywhere in the input → invalid.
- `isDangerousUrl()` rejects 14 hostile schemes and accepts plain http(s) URLs.
- `normalizeUrl()` returns `null` for anything it cannot normalise.

**`tests/unit/schemas.test.ts` (28 tests)** — the IPC boundary.

- `parsePayload()` throws an `AppError` with `E_VALIDATION_ERROR` and names the
  offending field.
- Unknown keys are **stripped**, so an unexpected setting can never be applied.
- Bounds hold: URL length, tab id length, at most 8 layout entries, at most 32
  context blocks, numeric ranges for zoom, timeouts and font sizes.

**`tests/unit/errors.test.ts` (7 tests)**, **`tests/unit/search-engines.test.ts` (11)**,
**`tests/unit/format.test.ts` (24)**, **`tests/unit/viewport.test.ts` (8)** — the
remaining pure helpers, including the pane maths used for the split view.

### 3.2 Integration — the real database

Each test creates a **real SQLite file** in a temporary directory, runs the **real**
migrations, and deletes the directory afterwards. No database is mocked.

**`tests/integration/database.test.ts` (9 tests)** proves that:

- the file is created and passes `PRAGMA integrity_check`;
- every migration is applied exactly once and recorded in `schema_migrations`;
- re-opening the same file does **not** re-apply migrations;
- foreign keys are enforced (inserting an orphan workspace tab throws);
- a transaction commits when the callback returns and **rolls back** when it throws;
- SQL errors are wrapped in an `AppError` with `E_DATABASE_ERROR`;
- a closed database refuses further statements;
- `backup()` produces a readable copy.

**`tests/integration/bookmarks.test.ts` (16)** — folder creation, position handling,
update, delete, move (including refusing to move a bookmark into itself or into an
unknown folder), reordering, search, duplicate detection, clearing and bulk insert.

**`tests/integration/history.test.ts` (10)** — visit recording, merging repeated
visits, keeping the previous title when the new one is empty, search, limit/offset,
removal, clearing a time range only, and top sites.

**`tests/integration/workspaces.test.ts` (13)** — workspace creation with defaults,
updating, deleting, the single-default invariant, reordering, workspace tabs
(add/update/move/remove) and tab groups.

**`tests/integration/settings.test.ts` (11)** — the defaults, persistence of one and
many values, ignoring values that are not part of the settings contract, ignoring
malformed stored JSON, raw values, and resetting to the defaults. It also covers the
permission decision repository (store, overwrite, reset).

**`tests/integration/snippets.test.ts` (12)** — snippet creation, update-in-place,
tags, search, folder filtering, deletion, plus the AI conversation repository
(create, context labels, streaming updates, clear, delete, rename).

### 3.3 Security — regression tests for the hardening

**`tests/security/navigation.test.ts` (33 tests)** — the protocol policy.

- The allow list contains exactly `http:` and `https:`.
- Every blocked scheme is in the block list, including `ms-msdt` and `search-ms`
  (Windows remote-execution protocols) and `intent://` / `android-app://`.
- 15 hostile URLs are rejected, including mixed case, leading whitespace and
  `data:` with a base64 payload.
- A URL that smuggles a scheme behind a control character is rejected.
- A URL with a newline before the scheme is rejected.
- `normalizeUrl()` never returns a value for a blocked scheme.
- The address bar never resolves a blocked scheme into a destination.
- `nexus://` is an internal route, not a website, and is not accepted in the address
  bar.

**`tests/security/ipc-contract.test.ts` (10 tests)** — the shape of the privileged
surface.

- Every channel name is unique and namespaced (`namespace:action`).
- No channel name is reused as an event name.
- The preload contains **exactly one** `exposeInMainWorld(` call and never exposes
  `ipcRenderer`, `require` or `process`.
- Every channel the preload invokes is declared in the contract.
- Every event the preload subscribes to is declared in the contract.
- Every declared channel has a handler in the main process.
- The main process checks the sender and returns an error envelope.

**`tests/security/ai-provider.test.ts` (11 tests)** — provider hardening.

- The mock provider labels every answer as a mock response and never claims to have
  contacted a model.
- The mock provider requires no API key and streams in chunks whose concatenation is
  exactly the final answer.
- An aborted request rejects with an `AppError`.
- A non-http(s) endpoint is rejected **before** any request is made (asserted with a
  `fetch` spy).
- The API key never appears in an error message.
- The API key is sent **only** in the `Authorization` header and never in the body.

**`tests/security/download-filename.test.ts` (8 tests)** — filename sanitisation.

- Directory components are removed (`../../etc/passwd` → `passwd`).
- Windows reserved characters (`< > : " | ? *`) are replaced.
- Control characters are stripped, leading dots are removed, whitespace is trimmed.
- A name with nothing usable left is rejected.
- The length is capped.

**`tests/security/download-save-path.test.ts` (5 tests)** — unique save paths.

- The plain name is used while the file does not exist.
- An existing file is not overwritten; ` (1)`, ` (2)`, ... is appended instead.
- Counting continues when several copies already exist.
- A name without an extension and a leading-dot name are both handled correctly.

### 3.4 Component — React in jsdom

**`tests/component/ui.test.tsx` (17 tests)** renders the real components with React
Testing Library:

- `Button` renders its label, defaults to `type="button"`, calls its handler and does
  **not** call it while disabled.
- `IconButton` exposes an accessible name and reports its pressed state.
- `Toggle` reflects and reports its state and stays inert while disabled.
- `Input` forwards changes and marks itself invalid; `Label` links to its control;
  `Select` renders its options.
- `Badge`, `Spinner`, `EmptyState` and `ErrorNote` render correctly, and the
  `EmptyState` action is clickable.

The suite runs in the `jsdom` environment through the `// @vitest-environment jsdom`
docblock. The global setup file installs the browser APIs jsdom does not implement
(`matchMedia`, `ResizeObserver`, `scrollIntoView`), provides a permissive
`window.nexus` stub and performs the React Testing Library cleanup between tests.

---

## 4. End-to-end tests

`tests/e2e/` contains a Playwright suite that launches the **real** application. It is
not part of `npm test` — it needs a built bundle and the Electron binary — but it **is**
part of `npm run verify`.

```bash
npm run test:e2e     # builds the application first, then runs Playwright
```

The script builds first so that the suite can never run against a stale bundle:

```
npm run build && playwright test
```

Measured result:

```
Running 19 tests using 1 worker
  19 passed (52.9s)
```

`tests/e2e/helpers.ts` launches `node_modules/electron/dist/electron.exe` with the
repository as the working directory, waits for the first window, and records every
console error and page error that the renderer produces. Every run gets its own
`--user-data-dir`, so the suite never touches the real profile.

`tests/e2e/app.spec.ts` then asserts that:

1. the shell renders and the privileged bridge answers `window.nexus.app.getInfo()`;
2. the start page is rendered inside the first tab;
3. the "New tab" button really creates a tab in the main process;
4. an internal `nexus://bookmarks` page opens in its own tab;
5. `nexus://settings` opens and a setting can be changed and read back;
6. a plain-text query is resolved to an `https://` search-engine URL;
7. a search typed on an internal page opens a real Chromium view (the tab leaves
   the internal page and a native view is attached to the window);
8. `javascript:alert(1)` is rejected by the navigation layer instead of being executed;
9. a visited page is written to the history store with its title and visit count;
10. **no renderer console error was produced during the whole session.**

`tests/e2e/browser-behaviour.spec.ts` covers the parts that only a real Chromium
session can prove:

11. a `Content-Disposition: attachment` response is recorded as a download and the
    file is written to the configured directory;
12. `Notification.requestPermission()` from a website reaches the shell as a
    `permission:requested` event and can be answered;
13. the "block third-party cookies" setting really stops a cross-origin
    `Set-Cookie` from being stored, and turning it off restores the default;
14. deleting a workspace closes its tabs, falls back to another workspace and
    leaves the browser able to create new tabs (a foreign-key regression);
15. cookies written by a website survive a restart of the application, proving that
    website views use the persistent default session.

A separate `PDF downloads` block launches a **fresh** application per test, because a
regression in the download stack can take the whole process down with it:

16. a "Download CV" link to a PDF downloads the file instead of leaving the tab on
    the blank document Chromium commits at the file URL — the click is a trusted
    `sendInputEvent`, and the page is asserted to be back on screen afterwards;
17. a PDF served with `Content-Disposition: attachment` is downloaded by Chromium
    itself and the interception stays out of the way;
18. a PDF opened through `target="_blank"` downloads and the tab that was created
    for the file is closed again, like Chrome does;
19. a second click downloads again into `cv (1).pdf`, so nothing is silently
    overwritten;
20. the "show download notifications" toggle really adds the "Downloaded …" toast
    when it is on and stops it when it is off.

The PDF tests are the reason the whole suite takes about a minute: each one starts
and stops a real Electron application.

The suite is deliberately network-free: every page it opens is served by a loopback
HTTP server started by the test itself.

---

## 5. Coverage

```bash
npm run test:coverage
```

The coverage configuration targets the shared layer and the main process:

```ts
coverage: {
  provider: 'v8',
  include: ['src/shared/**/*.ts', 'src/main/**/*.ts'],
  exclude: ['src/main/index.ts']
}
```

The renderer is not part of the coverage target because its behaviour is dominated by
Electron IPC that only exists at runtime; it is covered by the component suite and by
manual verification instead.

---

## 6. What the tests do **not** cover

Being explicit about this matters more than the numbers:

| Area | Why it is not covered |
| --- | --- |
| The download manager against a real HTTP download | Requires the network and a real download target. |
| The Electron `safeStorage` round trip | Requires the real OS keychain. |
| A live website asking for a permission | Requires a site that requests a permission. |
| Split view applied to two real `WebContentsView`s | The pane maths is unit tested; the physical layout is not asserted. |
| Print and picture-in-picture | Require a real OS integration. |

The Electron-dependent behaviour was additionally verified by **running the
application** — including the packaged build and the installed build — and by reading
the code. `docs/FEATURE_VERIFICATION.md` records exactly which parts were verified how.

---

## 7. Conventions

- Tests import from the same aliases as the application (`@shared`, `@main`,
  `@renderer`).
- `globals` is **off**: every test file imports `describe`, `it` and `expect` from
  `vitest` explicitly.
- The suite uses `it.each` for table-driven cases so that a failure names the exact
  input that broke.
- Integration tests always clean up their temporary directory in `afterEach`.
- Network access is stubbed with `vi.spyOn(globalThis, 'fetch')` — never with a real
  request.
- The global setup calls `vi.restoreAllMocks()` after every test.
