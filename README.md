# Nexus Browser

**Nexus Browser** is an AI-powered desktop web browser for Windows, built on Electron,
React, TypeScript and SQLite. It renders websites in **real Chromium views** (not a
simulated browser), keeps all data **local-first** in a file-backed SQLite database, and
ships an integrated assistant, developer toolkit and workspace manager.

Everything in this repository is original work. No telemetry, no tracking, no bundled
API keys, no paid dependencies.

---

## Table of contents

- [Feature overview](#feature-overview)
- [Screens](#screens)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Available scripts](#available-scripts)
- [Where your data lives](#where-your-data-lives)
- [AI providers](#ai-providers)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Security](#security)
- [Packaging for Windows](#packaging-for-windows)
- [Known limitations](#known-limitations)
- [Further documentation](#further-documentation)
- [License](#license)

---

## Feature overview

### Browsing

| Feature | Notes |
| --- | --- |
| Real Chromium rendering | Each tab is a `WebContentsView` with its own renderer process. |
| Tab strip | Create, close, pin, mute, duplicate, reorder, group and move tabs between workspaces. |
| Split view | Two tabs side by side, with a vertical or horizontal split and an adjustable ratio. |
| Address bar | Accepts URLs, `host/path`, `host:port` and plain search text. |
| Search engines | DuckDuckGo (default), Google, Bing, Brave, Ecosia, Startpage, plus a custom template. |
| History | Recorded per navigation, searchable, filterable by time range, exportable. |
| Bookmarks | Folders, reordering, search, import/export. |
| Downloads | Progress tracking, cancel, open, reveal in Explorer, configurable target directory, no silent overwriting, desktop notifications. |
| PDF files | A link to a PDF is downloaded instead of opening a blank tab; the page it was opened from stays on screen. |
| Find in page | Live match count and match navigation with `Enter` / `Shift+Enter`. |
| Zoom | 25 % – 300 %, per site. |
| Picture-in-picture | For HTML5 `<video>` elements. |
| Reader extraction | Isolated-world extraction of the main article text for the AI assistant. |
| Workspaces | Separate tab sets per workspace, saved and restorable sessions. |
| Private windows | Separate, non-persistent Electron session. |
| History / downloads panels | Sidebar drawers, always one click away. |

### Assistant

- Streaming chat panel (drawer) and a full assistant page.
- Nine one-click **actions**: Summarise, Explain, Key facts, Translate, Extract links,
  Write outline, Code review, Draft email, Improve writing.
- Context bundle built from the active page, the reader view and the current text
  selection, extracted in an **isolated world** so page scripts cannot tamper with it.
- Conversations are stored locally and can be renamed, cleared and deleted.
- The **offline mock provider** is the default and every answer it produces is labelled
  as a simulated response. It never contacts a network service.

### Developer toolkit

- Built-in HTTP client (GET/POST/PUT/PATCH/DELETE/HEAD) with headers, query parameters
  and JSON / form / raw bodies.
- Response viewer with syntax-highlighted JSON, headers, size and duration.
- Request collections that can be exported to and imported from JSON.
- Reusable **snippets** library (code, HTTP requests, notes) with folders, tags and
  favourites.

### Application

- Light and dark themes, five accent colours, compact/roomy density.
- Settings for search engine, home page, downloads, history, AI, editor appearance and
  privacy.
- Global data export (bookmarks, history, snippets, collections, AI conversations).
- Keyboard driven operation with a full shortcut set.

---

## Screens

The application shell is a single window:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Title bar — window controls, workspace switcher, AI toggle            │ 40 px
├──────────────────────────────────────────────────────────────────────┤
│ Tab strip — pinned tabs, groups, split indicator                     │ 36 px
├──────────────────────────────────────────────────────────────────────┤
│ Toolbar — back / forward / reload / stop, address bar, actions       │ 44 px
├────┬──────────────┬────────────────────────────────┬────────────────┤
│    │              │                                │                │
│ I  │  Sidebar     │  Website views (Chromium)      │  AI assistant  │
│ c  │  drawer      │  or internal Nexus page        │  drawer        │
│ o  │  280 px      │                                │  420 px        │
│ n  │              │                                │                │
│ 52 │              │                                │                │
├────┴──────────────┴────────────────────────────────┴────────────────┤
│ Status bar — zoom, security state, download and AI status            │ 26 px
└──────────────────────────────────────────────────────────────────────┘
```

Internal pages (`nexus://start`, `nexus://bookmarks`, `nexus://history`,
`nexus://downloads`, `nexus://workspaces`, `nexus://ai`, `nexus://dev`,
`nexus://settings`, `nexus://onboarding`) are rendered by React inside the same frame
so that the chrome never disappears.

---

## Technology

| Layer | Choice |
| --- | --- |
| Runtime | Electron 45 (Chromium 156) |
| Build | electron-vite 6 / Vite 8 |
| UI | React 19.3, TypeScript 5.9 |
| Styling | Tailwind CSS 4 with design tokens, dark & light |
| State | Zustand |
| Database | SQLite via `node-sqlite3-wasm` (WASM build, no native ABI dependency) |
| Validation | Zod 4 |
| Icons | lucide-react |
| Tests | Vitest 5, React Testing Library, Playwright (E2E) |
| Packaging | electron-builder 26 (NSIS installer + portable zip) |

`node-sqlite3-wasm` is used deliberately: it removes the native-module ABI dependency
on the Electron version while keeping a real, file-backed SQLite database with foreign
keys, transactions and versioned migrations.

---

## Quick start

### Requirements

- **Windows 10 (1809+) or Windows 11**, 64-bit
- **Node.js 20.19+** (developed against Node 22.15)

### Install and run

```bash
npm install
npm run dev
```

`npm run dev` starts electron-vite: the Vite dev server for the renderer, a watch build
for the main and preload processes, and launches Electron.

### Other entry points

```bash
npm run build      # production bundles into out/
npm run preview    # runs the production build
npm run package    # builds and packages the Windows installer into release/
```

### First run

The application opens the **onboarding** page the first time it starts. The offline
mock provider is selected by default, so the assistant works immediately without an
account. Configure a real provider in **Settings → AI**.

---

## Project layout

```
src/
  main/            Electron main process (authoritative state)
    ai/            assistant service, providers, prompts, context extraction
    app/           bootstrap, dependency container
    browser/       WebContentsView lifecycle, layout, favicons, PDF→download
    database/      SQLite wrapper, migrations, 11 repositories
    developer-tools/ HTTP client and collection import/export
    downloads/     download lifecycle
    ipc/           every privileged IPC handler
    permissions/   permission policy and prompts
    security/      credential storage (OS keychain)
    tabs/          authoritative tab state
    windows/       BrowserWindow lifecycle, shell CSP
  preload/         the only bridge between main and renderer
  renderer/        React application shell
    src/components/ chrome, panels, pages, UI primitives
    src/store/     Zustand stores
    src/lib/       pure helpers (formatting, viewport maths)
  shared/          types, constants, schemas, IPC contracts, URL logic
tests/
  unit/            pure logic
  integration/     real SQLite repositories
  security/        navigation, IPC contract and hardening regression tests
  component/       jsdom + React Testing Library
  e2e/             Playwright, drives the real Electron application
scripts/           icon generator, build helpers
docs/              architecture, security, threat model, testing, AI providers
```

The shared layer is imported by all three processes and contains **no** Electron
imports, which is what makes it unit-testable in isolation.

---

## Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development mode with hot reload. |
| `npm run dev:inspect` | Development mode with the main process inspector. |
| `npm run build` | Production build into `out/`. |
| `npm run preview` | Runs the production build. |
| `npm run typecheck` | `tsc --noEmit` for the node and web projects. |
| `npm run lint` | ESLint over the whole repository. |
| `npm run format` / `format:check` | Prettier. |
| `npm test` | Vitest unit, integration, security and component suites. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run test:coverage` | Vitest with V8 coverage. |
| `npm run test:e2e` | Builds and runs the Playwright end-to-end suite against the real application. |
| `npm run package` | Builds and packages the Windows installer. |
| `npm run verify` | typecheck → lint → format:check → test → test:e2e. |
| `node scripts/generate-icons.mjs` | Regenerates `build/icon.ico` and `build/icon.png`. |

---

## Where your data lives

| What | Windows path |
| --- | --- |
| Application data | `%APPDATA%\Nexus Browser\` |
| Database | `%APPDATA%\Nexus Browser\nexus.db` |
| Chromium profile (cookies, cache) | `%APPDATA%\Nexus Browser\Partitions\default\` |
| AI API key | Windows Credential Manager (DPAPI via Electron `safeStorage`) |

The database is a plain SQLite file. **Settings → Export data** writes a JSON bundle
containing bookmarks, history, snippets, collections and AI conversations.

### Private browsing

Private windows use the `nexus-private` session partition, which has **no** `persist:`
prefix. Chromium therefore keeps it in memory only and discards it when the app exits.
Tabs opened in a private window are not written to the database and no history is
recorded for them.

> Private browsing in Nexus means *not stored on this machine*. It is **not**
> anonymity: your network operator, your DNS resolver and the sites you visit still see
> you, and anything you type is still visible to the site.

### Workspaces

Workspaces are an **organisation** concept, not a security boundary. All workspaces
share the same Chromium session, so cookies and logins are shared between them. Use a
private window when you need a separate cookie jar.

---

## AI providers

| Provider | Notes |
| --- | --- |
| `mock` (default) | Fully offline. Always labelled as a simulated response. |
| `openai-compatible` | Any service speaking the OpenAI `/chat/completions` protocol. |

To use a real provider, open **Settings → AI**, choose *OpenAI-compatible API*, enter
the endpoint and the model, and paste the API key. The key is stored in the Windows
Credential Manager and is only sent to the endpoint you configured.

See [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) for the full details, including
exactly what page content is sent to a provider.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl` + `L` | Focus the address bar |
| `Ctrl` + `T` | New tab |
| `Ctrl` + `W` | Close tab |
| `Ctrl` + `Shift` + `T` | Reopen the last closed tab |
| `Ctrl` + `J` | Download panel |
| `Ctrl` + `D` | Bookmark the current page |
| `Ctrl` + `I` | Toggle the AI assistant |
| `Ctrl` + `R` / `Ctrl` + `Shift` + `R` | Reload / hard reload |
| `Ctrl` + `F` | Find in page |
| `Ctrl` + `Tab` / `Ctrl` + `Shift` + `Tab` | Next / previous tab |
| `Ctrl` + `1` … `Ctrl` + `9` | Jump to a tab |
| `Ctrl` + `0` | Reset zoom |
| `Ctrl` + `+` / `Ctrl` + `-` | Zoom in / out |
| `Ctrl` + `N` | New private window |
| `Alt` + `←` / `Alt` + `→` | History back / forward |
| `Esc` | Close the find bar or dismiss a prompt |

---

## Security

Nexus is built with a strict trust model:

- The **renderer never touches `ipcRenderer`**. It receives a typed, enumerated API
  through `contextBridge`.
- Every privileged handler validates its payload with a Zod schema and verifies the
  sender.
- The application shell runs with `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false` and a strict Content Security Policy.
- Website views run in separate `WebContentsView`s with no preload script, no Node
  integration and no permission to open native windows.
- Only `http:` and `https:` may be loaded by a website view; `javascript:`, `data:`,
  `file:` and the other dangerous schemes are blocked in the address bar, in
  `will-navigate` and in `will-redirect`.
- Certificate errors are never bypassed.
- Website permissions are denied unless the user explicitly allowed them for that
  origin.

Read [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
for the full model, and [`docs/FEATURE_VERIFICATION.md`](docs/FEATURE_VERIFICATION.md)
for an honest list of what is verified and what is not.

---

## Packaging for Windows

```bash
npm run package
```

This produces an NSIS installer and a portable zip in `release/`:

```
release/Nexus Browser-1.0.0-x64.exe    # NSIS installer (107.55 MB)
release/Nexus Browser-1.0.0-x64.zip    # portable archive (146.77 MB)
release/win-unpacked/Nexus Browser.exe # unpacked build (238.23 MB)
```

The installer was **verified end to end**: run silently it exits with code `0`,
installs to `%LOCALAPPDATA%\Programs\Nexus Browser`, creates an uninstaller, and the
installed application starts and reports `isPackaged: true`.

The installer is **not code signed** — Windows SmartScreen will show a warning on first
run. See [Known limitations](#known-limitations).

> On a slow or restricted network, `electron-builder` downloads the Electron archive
> and the NSIS/rcedit tool sets from GitHub. Set `ELECTRON_MIRROR` and
> `ELECTRON_BUILDER_BINARIES_MIRROR` to point at a faster mirror if the default is
> unreachable, for example
> `ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/`.

---

## Known limitations

These are real, and none of them are hidden:

1. **No code signing.** The installer and the executable are unsigned. SmartScreen and
   antivirus tools will warn.
2. **No auto-updater.** Updates are manual.
3. **Private browsing is not anonymity.** It prevents local storage only.
4. **Workspaces do not isolate cookies.** Only private windows use a separate session.
5. **Favicons are fetched with the default session**, so the favicon request is made
   with the same cookies as normal browsing. Favicons are fetched in the main process
   and handed to the renderer as `data:` URLs.
6. **The built-in HTTP client does not reuse browser cookies.** It is a separate,
   cookie-free client by design.
7. **No extension support.** There is no `chrome-extension://` support.
8. **PDF handling is download-only.** Electron 45's Chromium build does not render its
   PDF viewer in this configuration, so a link to a PDF downloads the file instead of
   opening a blank tab, and a PDF embedded in a page shows an empty frame.
9. **Split view is limited to two panes.** There is no grid layout in this version.
10. **The mock AI provider is a simulation.** It does not understand your content; it
    produces a clearly labelled placeholder.

---

## Further documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Process model, state ownership, IPC, database schema, layout algorithm. |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security controls, CSP, permission policy, credential storage. |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Assets, adversaries, attack surface, mitigations, residual risk. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setting up, conventions, adding an IPC channel, adding a page. |
| [`docs/TESTING.md`](docs/TESTING.md) | Test layout, how to run, what each suite proves. |
| [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) | Provider configuration and what data leaves the machine. |
| [`docs/FEATURE_VERIFICATION.md`](docs/FEATURE_VERIFICATION.md) | Per-feature verification status. |

---

## License

MIT — see [`LICENSE`](LICENSE).
