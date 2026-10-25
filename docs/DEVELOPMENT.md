# Development guide

Everything you need to build, run, test and extend Nexus Browser.

---

## 1. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20.19.0 (developed on 22.15) | `node --version` |
| npm | ≥ 10 | ships with Node 20+ |
| Windows | 10 (1809+) or 11, 64-bit | the application targets Windows only |
| Git | any | optional, the repository is not required to be a git repo |

```bash
npm install
```

> The `electron` package downloads the Chromium binary during install. On a slow
> connection this step can take a long time; see
> [Troubleshooting](#8-troubleshooting) if it appears to hang.

---

## 2. Everyday commands

```bash
npm run dev          # start the app with hot reload
npm run build        # production bundles in out/
npm run preview      # run the production build
npm run typecheck    # tsc --noEmit (node project + web project + e2e project)
npm run lint         # ESLint
npm run format       # Prettier write
npm test             # Vitest (unit + integration + security + component)
npm run test:e2e     # build, then Playwright against the real app
npm run package      # Windows installer in release/
npm run verify       # typecheck → lint → format:check → test → test:e2e
```

`npm run verify` is the gate to run before opening a pull request. It builds the
application and runs the end-to-end suite as well, so it is the closest thing to a
continuous-integration pipeline that runs locally.

---

## 3. Project structure

```
src/
  shared/      types, constants, schemas, IPC contracts, URL logic  (no Electron imports)
  main/        the privileged process
  preload/     the context bridge
  renderer/    the React shell
tests/
  unit/ integration/ security/ component/
  e2e/         Playwright specs
scripts/       build helpers (icon generation, CSP plugin)
docs/          this documentation
```

### The `shared` rule

`src/shared` **must not** import from `electron` or use Node.js APIs. It is imported
by the main process, the preload and the renderer, and it is the part of the codebase
that is unit-testable without a browser. If a helper is needed in two processes, it
belongs in `shared`.

The shared layer currently holds:

| Module | Contents |
| --- | --- |
| `types/` | `TabState`, `Bookmark`, `HistoryEntry`, `Workspace`, `AiMessage`, `AppSettings`, … |
| `constants/app.ts` | Window sizes, partitions, limits, internal page titles. |
| `constants/search-engines.ts` | Search engine definitions and `buildSearchUrl`. |
| `constants/ai-actions.ts` | The nine assistant actions. |
| `errors/` | `ERROR_CODES`, `AppError`, `toSerializedError`. |
| `navigation/url.ts` | URL parsing, the scheme allow list, `resolveDestination`. |
| `schemas/` | Every Zod schema used by the IPC boundary. |
| `contracts/` | Channel names, request/response types, the `NexusApi` interface. |

---

## 4. Conventions

### TypeScript

The repository uses three TypeScript projects:

| Project | Includes | `lib` |
| --- | --- | --- |
| `tsconfig.node.json` | `src/main`, `src/preload`, `src/shared`, the unit, integration and security suites | `ES2023` + Node types |
| `tsconfig.web.json` | `src/renderer`, `src/shared`, the component suite | `ES2023` + DOM |
| `tsconfig.e2e.json` | `tests/e2e` | `ES2023` + DOM + Node types |

The end-to-end project needs **both** DOM types (the browser-side `window.nexus`) and
Node types (the Playwright launcher), which is why it is separate from the other two.

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- `noUnusedLocals` and `noUnusedParameters` are on — the build fails on dead code.
- Use `import type` for type-only imports (required by `isolatedModules`).
- Prefer `readonly` arrays for exported constants.
- Errors are values, not strings: use `AppError` with a code from `ERROR_CODES`.

### Styling

- Tailwind CSS 4 with design tokens defined in `src/renderer/src/styles.css`.
- Use the semantic tokens (`bg-surface`, `text-ink`, `border-line`, `text-accent`,
  `bg-accent`) instead of raw colours, so that the light and dark themes both work.
- `cn()` merges conditional class names.

### React

- The renderer is a projection of the main process state. Do not keep a second copy of
  the tab list in a local `useState`.
- Data loading in effects is intentional; the `react-hooks/set-state-in-effect` rule is
  disabled for that reason.
- Never use `dangerouslySetInnerHTML`. AI output and page titles are rendered as
  text.

### Paths

| Alias | Resolves to |
| --- | --- |
| `@shared/*` | `src/shared/*` |
| `@main/*` | `src/main/*` |
| `@preload/*` | `src/preload/*` |
| `@renderer/*` | `src/renderer/src/*` |

They are configured in `electron.vite.config.ts`, `tsconfig.node.json`,
`tsconfig.web.json`, `tsconfig.e2e.json` and `vitest.config.mts`. **All five** must be
updated when a new alias is added.

---

## 5. Adding an IPC channel

This is the most common extension point. The example adds
`nexus.history.clear(range)`.

**1 — Name the channel** (`src/shared/contracts/channels.ts`):

```ts
export const IPC_CHANNELS = {
  // …
  historyClear: 'history:clear'
} as const
```

**2 — Type the request and the response** (`src/shared/contracts/ipc.ts`):

```ts
export interface IpcRequests {
  // …
  'history:clear': { request: { range: HistoryRange }; response: { cleared: number } }
}
```

**3 — Declare the API method** (`src/shared/contracts/api.ts`):

```ts
export interface NexusApi {
  history: {
    // …
    clear(range: HistoryRange): Promise<{ cleared: number }>
  }
}
```

**4 — Implement it in the preload** (`src/preload/index.ts`):

```ts
history: {
  clear: (range) => call(IPC_CHANNELS.historyClear, { range })
}
```

**5 — Validate the payload** (`src/shared/schemas/index.ts`):

```ts
export const zHistoryClearRequest = z.object({ range: z.enum(['all', 'hour', 'day', 'week', 'month']) })
```

**6 — Register the handler** (`src/main/ipc/register-ipc.ts`):

```ts
handle(IPC_CHANNELS.historyClear, (payload) => {
  const request = parsePayload(zHistoryClearRequest, payload)
  return { cleared: services.history.clear(request.range) }
})
```

**7 — Test it.** `tests/security/ipc-contract.test.ts` fails automatically if a
declared channel has no handler or if the preload uses an undeclared channel.

---

## 6. Adding an internal page

1. Create `src/renderer/src/components/pages/MyPage.tsx` that renders a
   `<PageShell>` with the content.
2. Add the route to `InternalPage.tsx`:
   ```ts
   case 'nexus://my-page':
     return <MyPage />
   ```
3. Add the title to `INTERNAL_PAGE_TITLES` in `src/shared/constants/app.ts` so the
   tab gets the right name.
4. Open it from the UI with:
   ```ts
   await nexus.tabs.create({ url: 'nexus://my-page' })
   ```

Internal pages are React components inside the shell, so they have the full typed
API available and inherit the strict shell CSP. They must not need their own
`WebContentsView`.

---

## 7. Database changes

1. Add a new entry to `MIGRATIONS` in `src/main/database/migrations.ts` with the next
   version number and a descriptive name.
2. Use `IF NOT EXISTS` where possible so a partially applied migration can be re-run.
3. Never edit an existing migration — it has already run on real installations.
4. If you add a column that the repositories read, update the repository and add an
   integration test in `tests/integration/`.

The migration list is applied at startup inside a transaction and recorded in
`schema_migrations`.

---

## 8. Troubleshooting

### `npm install` hangs on "Downloading Electron binary"

The Electron binary (~150 MB) is downloaded from GitHub releases. On a slow or
restricted network this can stall. Options:

```bash
# Use a mirror
set ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/
npm install

# Or download the zip manually and point Electron at the extracted directory
set ELECTRON_OVERRIDE_DIST_PATH=C:\path\to\electron-dist
```

`ELECTRON_OVERRIDE_DIST_PATH` is honoured by the **`electron` package's installer**
only — `electron-builder` does not read it. For the packaging step use the mirror
variables instead:

```bash
set ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://cdn.npmmirror.com/binaries/electron-builder-binaries/
npm run package
```

`ELECTRON_BUILDER_BINARIES_MIRROR` covers the NSIS installer, the NSIS resources and
the `rcedit`/code-signing tool set (~8 MB in total). Everything downloaded is
checksum-verified against the hashes that `electron-builder` ships with, so a mirror
cannot silently substitute a payload.

If the disk is tight, note that `electron-builder` keeps a second copy of the Electron
archive in `%LOCALAPPDATA%\electron-builder\Cache` and unpacks the application into
`release/win-unpacked`; the installer and the portable zip need roughly 1.5 GB of free
space on top of the build output.

### The dev server starts but the window is blank

- Check the DevTools console. A CSP violation is usually the cause — the production
  policy is `default-src 'none'`.
- Make sure `npm run build` succeeds; the dev server compiles on demand and reports
  transform errors in the terminal.

### `npm run package` fails with "electron-builder cannot find the electron binary"

This is the same download problem as above. Set `ELECTRON_MIRROR` and
`ELECTRON_BUILDER_BINARIES_MIRROR` and run the command again — the archives are cached
in `%LOCALAPPDATA%\electron-builder\Cache` and `%LOCALAPPDATA%\electron\Cache`, so
the second attempt only repeats the work that failed.

### The database is locked

Close every running instance of Nexus. The application takes a single-instance lock on
startup, so a second instance hands over to the first.

---

## 9. Code style

- Prettier: 100 columns, single quotes, no trailing commas, semicolons.
- ESLint: flat config in `eslint.config.mjs`, separate blocks for Node and renderer
  code.
- Two ESLint rules are intentionally disabled:
  - `react-hooks/set-state-in-effect` — loading data in an effect is the intended
    pattern here.
  - `react-hooks/preserve-manual-memoization` — the React Compiler handles
    memoisation.
- `react-hooks/exhaustive-deps` **stays enabled**.

Run `npm run format` before committing; the repository is formatted with Prettier.

---

## 10. Icons

The application icon is generated programmatically so that no binary asset has to be
committed:

```bash
node scripts/generate-icons.mjs
```

This writes `build/icon.ico` (16, 24, 32, 48, 64, 128 and 256 pixels) and
`build/icon.png` (256×256). Both are used by `electron-builder.yml`.
