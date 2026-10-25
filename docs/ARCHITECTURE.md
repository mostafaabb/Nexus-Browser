# Architecture

This document describes how Nexus Browser is put together: the process model, who owns
which state, how the three processes talk to each other, how the database is organised
and how the split-view layout is computed.

---

## 1. Process model

Nexus is a standard three-process Electron application with a strict trust boundary
between them.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Main process (Node.js)                                               │
│                                                                       │
│  bootstrap → AppServices (dependency container)                      │
│      ├── DatabaseService        SQLite + 11 repositories             │
│      ├── WindowManager          BrowserWindow lifecycle, shell CSP   │
│      │     └── TabManager       authoritative tab state per window  │
│      │           └── BrowserViewManager   WebContentsView lifecycle  │
│      ├── PermissionManager      permission policy + prompts          │
│      ├── PdfNavigationHandler   PDF navigations become downloads      │
│      ├── DownloadManager        download lifecycle                  │
│      ├── CredentialStore        OS keychain (safeStorage)            │
│      ├── AiService              assistant orchestration             │
│      │     ├── MockProvider                                          │
│      │     └── OpenAiCompatibleProvider                             │
│      ├── ContextExtractor       isolated-world page extraction      │
│      └── HttpClient             developer API client                │
│                                                                       │
│  register-ipc → every privileged handler, Zod-validated              │
└───────────────┬───────────────────────────────────────────────────────┘
                │  contextBridge (typed API)  │  ipcRenderer.invoke
                │  ─────────────────────────►│  ◄─────────────────
┌───────────────┴───────────────────────────────────────────────────────┐
│ Preload (sandboxed, contextIsolated)                                │
│   • wraps every channel in a { ok, data | error } envelope            │
│   • unwraps the envelope, throws NexusApiError on failure            │
│   • exposes exactly one global: window.nexus                         │
└───────────────┬───────────────────────────────────────────────────────┘
                │  window.nexus.*()
┌───────────────┴───────────────────────────────────────────────────────┐
│ Renderer — application shell (React)                                 │
│   • renders the chrome and the internal nexus:// pages               │
│   • computes the website view layout and pushes the bounds            │
│   • never touches ipcRenderer, never sees Node.js                    │
└───────────────────────────────────────────────────────────────────────┘
                │
                │  separate processes, no preload, no Node
┌───────────────┴───────────────────────────────────────────────────────┐
│ Website views (WebContentsView, one per tab)                         │
│   • contextIsolation, sandbox, no nodeIntegration                    │
│   • setWindowOpenHandler → deny                                     │
│   • will-navigate / will-redirect → http(s) only                    │
└───────────────────────────────────────────────────────────────────────┘
```

### Why the main process owns the state

Tab state lives in the main process, not in React. A renderer that owns browser state
has three problems: it can be tampered with, it cannot survive a reload, and two
windows cannot agree on the same tab. Nexus solves this by making the main process
authoritative:

- `TabManager` holds the canonical `TabState` for every tab.
- The renderer is a **projection**. It receives `tab:updated`, `tab:removed`,
  `tab:activated` and `tab:list-changed` events and renders them.
- Every mutation (navigate, close, pin, mute, move, reorder) is a request to the main
  process. The renderer never mutates a tab directly.

The consequence is that a compromised renderer cannot invent tabs, navigate to a
forbidden URL or read another window's state.

### Session partitions

Electron sessions are isolated by partition name. Nexus uses four:

| Partition | Purpose | Persistent |
| --- | --- | --- |
| `default` | Ordinary website views. Chromium's default session. | Yes |
| `nexus-private` | Website views in private windows. | **No** |
| `persist:nexus-shell` | The application shell of normal windows. | Yes |
| `nexus-shell-private` | The application shell of private windows. | **No** |

The shell lives in its own partition so that a website can never influence the state of
the user interface (cookies, storage, service workers). The `persist:` prefix is
deliberately absent from the private partitions — that is exactly what makes Electron
keep them in memory only.

The default partition is special: `webPreferences.partition = 'default'` is resolved by
Electron through `session.fromPartition('default')`, which returns a **different,
in-memory** session than `session.defaultSession`. Website views therefore *omit* the
`partition` option for normal browsing, which is the only way to get the persistent
default session — the one the download manager, the permission manager and the
cookie policy observe. Private windows keep their explicit in-memory partition.

---

## 2. The IPC contract

`src/shared/contracts/channels.ts` is the single source of truth for channel names.
`src/shared/contracts/ipc.ts` maps every channel to its request and response types.
`src/shared/contracts/api.ts` defines the `NexusApi` interface that the preload
exposes.

```
Renderer                         Preload                        Main
  │                                │                             │
  │ nexus.tabs.create({url})       │                             │
  │ ─────────────────────────────► │                             │
  │                                │ ipcRenderer.invoke(        │
  │                                │   'tabs:create', payload)  │
  │                                │ ──────────────────────────►│
  │                                │                             │ validate sender
  │                                │                             │ Zod-parse payload
  │                                │                             │ run handler
  │                                │ ◄──────────────────────────│ { ok, data | error }
  │                                │                             │
  │                                │ unwrap envelope             │
  │ ◄───────────────────────────── │ throw NexusApiError        │
  │  (or throws NexusApiError)      │                             │
```

### Rules

1. **Every handler validates the sender.** `register-ipc.ts` resolves the
   `BrowserContext` from `event.sender.id`; a message from an unknown sender is
   rejected with `E_UNAUTHORIZED_SENDER`.
2. **Every payload is validated with a Zod schema** from `src/shared/schemas/index.ts`.
   A malformed payload never reaches the handler body.
3. **Errors are returned, not thrown.** The main process replies with
   `{ ok: false, error: { code, message, details } }`. The preload converts that into a
   `NexusApiError` with the machine-readable `code`, so the renderer can distinguish
   "blocked scheme" from "network error" without string matching.
4. **No channel is exposed by name.** The renderer never passes a channel name; it
   calls a named method on the typed API.

### Adding a channel

1. Add the name to `IPC_CHANNELS` in `src/shared/contracts/channels.ts`.
2. Add the request/response types to `IpcRequests` in `src/shared/contracts/ipc.ts`.
3. Add the method to the `NexusApi` interface in `src/shared/contracts/api.ts`.
4. Implement the method in `src/preload/index.ts`.
5. Add a Zod schema in `src/shared/schemas/index.ts`.
6. Register the handler in `src/main/ipc/register-ipc.ts`.

A contract test (`tests/security/ipc-contract.test.ts`) fails if a declared channel has
no handler or if the preload invokes a channel that is not declared.

---

## 3. Rendering websites

### Views

Each website tab owns one `WebContentsView` created by `BrowserViewManager`. The view
is created lazily when the tab is first shown and destroyed when the tab closes.

```ts
new WebContentsView({
  webPreferences: {
    preload: undefined,          // no bridge for websites, ever
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    plugins: false,
    partition                    // 'default' or 'nexus-private'
  }
})
```

### Layout

The renderer owns the *visual* layout; the main process owns the *physical* bounds.

1. `Viewport.tsx` measures the content area with a `ResizeObserver` and computes the
   bounds of each pane.
2. The pure function `computePanes()` in `src/renderer/src/lib/viewport.ts` turns the
   tab list plus the split layout into a list of panes.
3. The renderer sends the result to the main process via `layout:setViews`.
4. `BrowserViewManager.applyLayout()` converts the bounds to device pixels, attaches
   and detaches `WebContentsView`s and calls `view.setBounds()`.

Because the renderer only ever reports rectangles (which are range-checked by
`zViewLayoutRequest`), a compromised renderer cannot move a view off-screen into a
privileged area or create more than eight views.

```
   ┌──────────────────── content area ────────────────────┐
   │  pane A                 │        pane B                │
   │  tab-1  x=0 w=60%       │        tab-2  x=60% w=40%    │
   └─────────────────────────┴───────────────────────────────┘
```

### Internal pages

`nexus://…` routes are **not** loaded into a website view. They are rendered by React
inside the content area of the shell, so they inherit the strict shell CSP and can
use the full IPC API. A tab whose URL is an internal route simply has no
`WebContentsView` — `computePanes()` reports it as `kind: 'internal'`.

### Favicons

Favicons are downloaded in the **main process** with `net.fetch()`, restricted to
`image/*` responses of at most 128 KB, and converted to a `data:` URL before being sent
to the renderer. The renderer therefore never issues a third-party request, which is
what allows the shell CSP to use `img-src 'self' data:`.

---

## 4. Data layer

### Storage engine

`node-sqlite3-wasm` provides a real SQLite engine compiled to WebAssembly. The WASM
build was chosen over a native addon because it removes the ABI coupling between the
installed Node/Electron version and the prebuilt binary, which is a recurring source
of broken installs on Windows.

The wrapper (`src/main/database/database.ts`) provides a small synchronous API:

```ts
db.get<T>(sql, params): T | null
db.all<T>(sql, params): T[]
db.run(sql, params): RunResult
db.transaction(fn): void     // rolls back on throw
db.backup(targetPath): void
```

Foreign keys are enabled. SQL errors are wrapped in an `AppError` with the code
`E_DATABASE_ERROR`.

### Migrations

Migrations live in `src/main/database/migrations.ts` and are applied in order at
startup. Each one is recorded in `schema_migrations`. The statements are written with
`IF NOT EXISTS` where possible so that a partially applied migration can be re-run
safely.

| Version | Name | Contents |
| --- | --- | --- |
| 1 | `initial-schema` | settings, bookmarks, history, downloads, workspaces, workspace tabs, tab groups, recently closed, saved sessions, snippets, snippet folders, API collections, API requests, AI conversations, AI messages, permission decisions, HTTP history |
| 2 | `encrypted-credentials` | `secrets` table for OS-encrypted credential blobs |
| 3 | `session-recovery` | `url` and `title` columns on `workspace_tabs` so sessions can be restored |

### Repositories

Eleven repositories sit on top of the raw database. Each one owns one domain and
returns typed domain objects, never raw rows.

| Repository | Responsibility |
| --- | --- |
| `SettingsRepository` | Key/value application settings with a typed schema and defaults. |
| `BookmarksRepository` | Tree of bookmarks and folders, reordering, search, import/export. |
| `HistoryRepository` | Visit records with visit counts, time-range queries, top sites. |
| `DownloadsRepository` | Download records and their lifecycle. |
| `WorkspacesRepository` | Workspaces, workspace tabs, tab groups, session snapshots. |
| `SessionsRepository` | Saved and restored sessions. |
| `SnippetsRepository` | Snippet library and folders. |
| `CollectionsRepository` | API request collections and requests. |
| `AiRepository` | AI conversations and messages. |
| `PermissionsRepository` | Per-origin permission decisions. |
| `HttpHistoryRepository` | History of requests issued by the developer client. |

Settings are stored as JSON and validated on read, so a corrupted or hand-edited
value can never crash the application — it falls back to the default.

---

## 5. The AI subsystem

```
AiPanel / AiPage
      │  nexus.ai.send({ prompt, actionId, context })
      ▼
AiService.send()
      ├── resolve action (AI_ACTIONS) → prompt template
      ├── buildUserPrompt(prompt, context)
      ├── persist user + assistant placeholder messages
      ├── provider.complete({ messages, onChunk })
      │      └── emits 'chunk' events → renderer appends to the message
      └── persists the final message, emits 'done' | 'error' | 'cancelled'
```

- **Streaming** is delivered through the `ai:chunk` event; the renderer appends the
  delta to the assistant message. The store handles chunks that arrive *before* the
  `send()` promise resolves.
- **Cancellation** uses an `AbortController` per conversation; `ai:stop` aborts it and
  the partial answer is kept with the status `cancelled`.
- **Context** is extracted by `ContextExtractor` using
  `executeJavaScriptInIsolatedWorld(9999, …)`. The isolated world has a separate
  JavaScript context from the page, so the page cannot override the extraction
  functions or the returned object.
- The context bundle is capped at `MAX_AI_CONTEXT_CHARS` (24 000 characters) and
  truncated proportionally when it exceeds the limit.
- The **mock provider** is the default. It never makes a network request and every
  answer starts with an explicit "Mock response" banner. This is enforced by a test
  (`tests/security/ai-provider.test.ts`).

---

## 6. Security layers

| Layer | Control |
| --- | --- |
| Shell renderer | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |
| Website views | Same, **plus** no preload script at all |
| Preload | One global (`window.nexus`), typed, no `ipcRenderer` leak |
| IPC | Sender validation + Zod payload validation + error envelope |
| CSP | Strict `default-src 'none'` for the shell; injected both as a meta tag and as a response header |
| Navigation | `http:`/`https:` only; `javascript:`, `data:`, `file:` and friends blocked in the address bar, `will-navigate` and `will-redirect` |
| Windows | `setWindowOpenHandler` denies all native windows; external links go through a validated `app:openExternal` |
| Permissions | Deny-by-default; unknown permissions are denied outright |
| Certificates | `certificate-error` never bypasses |
| Credentials | Stored with `safeStorage` (DPAPI on Windows) |

See [`SECURITY.md`](SECURITY.md) and [`THREAT_MODEL.md`](THREAT_MODEL.md) for the
full picture.

---

## 7. Renderer structure

```
src/renderer/src/
  App.tsx                 layout composition + global keyboard shortcuts
  components/
    TitleBar.tsx          window controls, workspace switcher
    TabStrip.tsx          tabs, groups, split indicator
    AddressBar.tsx        URL / search input
    Toolbar.tsx           navigation actions
    Viewport.tsx          measures the content area, renders panes
    Sidebar.tsx           icon rail + drawer (bookmarks/history/downloads/snippets)
    StatusBar.tsx         zoom, security state, download + AI status
    AiPanel.tsx           assistant drawer (shared by the drawer and the page)
    PermissionPrompt.tsx  website permission prompt
    FindBar.tsx           find in page
    Toaster.tsx           transient notifications
    InternalPage.tsx      routes nexus:// URLs to a page component
    pages/                Start, Bookmarks, History, Downloads, Workspaces,
                          Settings, Dev, Ai, Onboarding
    ui/                   Button, Input, Toggle, Menu, Feedback primitives
  store/
    app-store.ts          tabs, windows, workspaces, navigation, layout
    ai-store.ts           conversations, streaming messages
  lib/
    api.ts                typed access to window.nexus
    cn.ts                 class name helper
    format.ts             byte/time/URL formatting
    viewport.ts           pure pane computation (unit tested)
```

State lives in two Zustand stores. The `app-store` is a mirror of the main process
state; the `ai-store` owns the assistant's transient state (streaming buffers, the
current conversation).

---

## 8. Error handling

There are three error classes and each has its own path:

| Class | Example | Path |
| --- | --- | --- |
| Expected, user-facing | Blocked scheme, missing tab, provider error | `AppError` with a code → envelope → `NexusApiError` → shown in the UI |
| Expected, recoverable | Favicon download failed, view already destroyed | Logged at `debug`/`warn`, the feature degrades gracefully |
| Programming error | Unreachable branch, broken invariant | Logged at `error` with the stack, surfaced as `E_INTERNAL` |

Nothing is swallowed silently: every `catch` block either logs with context, rethrows,
or converts the failure into a typed error with a machine-readable code.

The logger (`src/main/utils/logger.ts`) redacts any field whose name looks like a
secret (`key`, `token`, `secret`, `password`, `authorization`, `cookie`, `apikey`) and
truncates strings at 500 characters.

---

## 9. Build pipeline

`electron.vite.config.ts` defines three builds:

| Target | Output | Notes |
| --- | --- | --- |
| `main` | `out/main/index.js` | Node target, bundles the shared layer and the main sources. |
| `preload` | `out/preload/index.js` | Bundles **all** dependencies, because a sandboxed preload cannot `require` external packages. |
| `renderer` | `out/renderer/` | Standard Vite React build, plus the CSP meta-tag plugin. |

Aliases `@shared`, `@main`, `@preload` and `@renderer` are configured in
`electron.vite.config.ts`, `tsconfig.node.json`, `tsconfig.web.json` and
`vitest.config.mts` so that the same import specifier works everywhere.

The CSP plugin (`scripts/vite-plugin-csp.ts`) injects a `<meta http-equiv="Content-Security-Policy">`
tag: strict in production, relaxed in development (inline scripts and the HMR
websocket are required in dev). The main process additionally sets the same policy as
a response header on the shell partition.

---

## 10. Testing strategy

| Suite | Location | What it proves |
| --- | --- | --- |
| Unit | `tests/unit/` | Pure logic: URL resolution, schemas, error mapping, formatting, viewport maths. |
| Integration | `tests/integration/` | The real SQLite engine against a temporary file: migrations, transactions, repositories. |
| Security | `tests/security/` | Protocol blocking, the IPC contract, provider hardening, filename sanitisation. |
| Component | `tests/component/` | React components in jsdom with React Testing Library. |
| End-to-end | `tests/e2e/` | The real application: the shell, the bridge, tab creation, internal pages and the navigation policy. |

See [`TESTING.md`](TESTING.md) for the details.
