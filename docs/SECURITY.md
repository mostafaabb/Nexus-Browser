# Security

This document describes the security controls that Nexus Browser implements, where they
are implemented, and how they are verified.

The threat model is described separately in [`THREAT_MODEL.md`](THREAT_MODEL.md).

---

## 1. Trust model

Nexus treats the three processes as having different trust levels:

| Component | Trust | Why |
| --- | --- | --- |
| **Main process** | Fully trusted | It owns the filesystem, the database and the OS integration. |
| **Preload** | Fully trusted | It is part of the application. It is the only code allowed to touch `ipcRenderer`. |
| **Shell renderer** | Partially trusted | It runs application code, but it must never be able to exceed the API it was given. |
| **Website views** | Untrusted | Arbitrary remote code from arbitrary origins. |

Everything the shell renderer does that touches the system goes through the preload
bridge, and every bridge call is checked again in the main process. A bug in the
renderer therefore cannot become a privilege escalation by itself.

---

## 2. Process isolation

### Shell renderer

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  plugins: false,
  partition: SHELL_PARTITION
}
```

`src/main/windows/window-manager.ts`

### Website views

```ts
webPreferences: {
  preload: undefined,          // <- websites get no bridge at all
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  plugins: false,
  enableWebSQL: false,
  partition                    // 'default' or 'nexus-private'
}
```

`src/main/browser/browser-view-manager.ts`

A website view has **no preload script**, so it has no access to `window.nexus`, no
access to `ipcRenderer` and no way to reach the main process. Even if a site finds an
XSS, it can only act inside its own view.

The shell and the websites also live in **different session partitions**, so a site
cannot set a cookie that the shell would read, register a service worker for the shell
origin, or poison the shell's cache.

---

## 3. The context bridge

`src/preload/index.ts` exposes exactly one global:

```ts
contextBridge.exposeInMainWorld('nexus', api)
```

- `ipcRenderer` itself is **never** exposed.
- `require`, `process` and `Buffer` are **never** exposed.
- The API object is built from a typed interface (`NexusApi` in
  `src/shared/contracts/api.ts`), so every method has a declared request and response
  shape.
- A contract test asserts that the preload file contains exactly one
  `exposeInMainWorld(` call and that it never exposes `ipcRenderer`, `require` or
  `process`.

### Error handling

Every privileged call returns an envelope:

```ts
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
```

The preload unwraps it and throws a `NexusApiError` that carries the machine-readable
error code. The renderer can therefore distinguish `E_BLOCKED_SCHEME` from
`E_NETWORK_ERROR` without inspecting message strings.

---

## 4. IPC validation

Two independent checks run before any handler body executes.

### 4.1 Sender validation

`register-ipc.ts` resolves the calling `BrowserContext` from `event.sender.id`:

```ts
const context = windows.getContextByWebContents(event.sender.id)
if (!context) {
  throw new AppError(ERROR_CODES.UNAUTHORIZED_SENDER, 'The request did not come from a known window.')
}
```

A message that did not originate from a Nexus window is rejected with
`E_UNAUTHORIZED_SENDER`.

### 4.2 Payload validation

Every handler parses its payload with a Zod schema before touching any state:

```ts
const request = parsePayload(zNavigateRequest, payload)
```

The schemas in `src/shared/schemas/index.ts` enforce:

- **Length bounds** on every string (URLs ≤ 4096, tab ids ≤ 128, prompts ≤ 32 000 …).
- **Numeric ranges** (zoom, timeout, font size, layout coordinates).
- **Enumerations** (HTTP methods, history ranges, workspace layouts, themes).
- **Array limits** (≤ 8 layout entries, ≤ 32 context blocks, ≤ 64 headers).
- **Unknown keys are stripped**, not forwarded. An unexpected setting key can never
  reach the database.

A validation failure becomes `E_VALIDATION_ERROR` with the offending field in
`details`; the handler body is never entered.

---

## 5. Content Security Policy

The shell is privileged, so the policy is `default-src 'none'`:

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self';
media-src 'none';
object-src 'none';
frame-src 'none';
frame-ancestors 'none';
base-uri 'none';
form-action 'none';
worker-src 'self'
```

It is applied **twice**, on purpose:

1. As a `<meta http-equiv="Content-Security-Policy">` tag injected at build time by
   `scripts/vite-plugin-csp.ts`.
2. As a response header set by the main process on the shell session partition
   (`session.webRequest.onHeadersReceived`).

The meta tag is the second line of defence for the bundled document; the header
covers the case where the document is loaded from somewhere else.

`img-src 'self' data:` is only possible because **favicons are fetched in the main
process** and passed to the renderer as `data:` URLs. The renderer never loads a
third-party URL.

In development the policy is relaxed (`'unsafe-inline'`, `'unsafe-eval'`, `ws:` for
hot module replacement). The relaxation is bound to `ctx.server` in the Vite plugin and
to `app.isPackaged` in the main process — a packaged build always gets the strict
policy.

---

## 6. Navigation control

### 6.1 Address bar

`src/shared/navigation/url.ts` decides what the address bar may navigate to.

Blocked schemes (partial list):

```
javascript, data, file, vbscript, blob, about, chrome, chrome-extension,
devtools, view-source, ws, wss, ftp, ftps, intent, android-app, jar,
ms-msdt, search-ms, mhtml, resource, chrome-devtools
```

Only `http:` and `https:` are allowed. In addition:

- Any ASCII control character in the input makes it invalid, which prevents
  `java\u0000script:` style smuggling.
- A bare host (`example.com`), a host with a path (`example.com/docs`) and a host
  with a port (`example.com:8443`) are resolved to `https://` URLs.
- Loopback addresses (`localhost`, `127.0.0.1`, `::1`) resolve to `http://`.
- A `nexus://` URL typed into the address bar is rejected — internal pages are only
  reachable through the user interface.

### 6.2 Website views

Even if a page manages to trigger a navigation to a forbidden scheme, the view
refuses it:

```ts
contents.on('will-navigate',  (event, url) => { if (!this.isNavigable(url)) event.preventDefault() })
contents.on('will-redirect', (event, url) => { if (!this.isNavigable(url)) event.preventDefault() })
```

`isNavigable()` requires the scheme to be in `ALLOWED_SCHEMES` **and** the URL to pass
`isDangerousUrl()`.

### 6.3 Native windows

```ts
contents.setWindowOpenHandler(() => ({ action: 'deny' }))
```

The shell never opens a native window either. `window.open()` and
`target="_blank"` are converted into a request to the application, which asks the user
what to do. External links are handed to the operating system only through
`app:openExternal`, which validates the scheme first: only `http:`, `https:` and
`mailto:` are passed to `shell.openExternal`. `mailto:` is included because it cannot
navigate Chromium; it is screened separately so that a blocked scheme such as
`javascript:` or `file:` can never slip through the external path either.

### 6.4 Certificates

```ts
contents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
  event.preventDefault()
  callback(false)
})
```

Certificate errors are **never** bypassed. There is no "proceed anyway" path.

---

## 7. Permission policy

`src/main/permissions/permission-manager.ts` installs a permission request handler
and a permission check handler on the website sessions.

- **Deny by default.** A permission that is not in the known list is denied outright.
- **Sensitive permissions** always require an explicit user decision:
  `media`, `geolocation`, `notifications`, `midi`, `midiSysex`, `pointerLock`,
  `openExternal`, `clipboard-read`, `fullscreen`, `display-capture`, `hid`, `serial`,
  `usb`.
- **Decisions are stored per origin and per permission** in the `permission_decisions`
  table and are reused on later visits.
- The prompt is rendered by the shell (`PermissionPrompt.tsx`), which shows the origin
  and the permission that is being requested.
- Pending requests are denied when the window closes (`denyAll()`).

`setPermissionCheckHandler` answers synchronously from the stored decisions, so a
page that asks "do I have permission?" gets the same answer as the one that was
granted to the user.

The handlers are installed on the sessions the website views actually use: the
persistent default session for normal windows and `nexus-private` for private ones.

### 7.1 Third-party cookies

`src/main/privacy/cookie-policy.ts` implements the *Block third-party cookies*
setting. Electron 45 does not expose Chromium's content settings, so the policy is
enforced on the network layer: an `onHeadersReceived` interceptor removes
`Set-Cookie` from a response whose origin differs from the origin of the top level
page (falling back to the request initiator while a frame is still loading).

Other response headers are left untouched, and the interceptor is a no-op while the
setting is off. The blocking is applied to the default and the private session and
changes take effect immediately when the setting is toggled.

### 7.2 PDF navigations become downloads

Electron 45's build of Chromium ships a PDF viewer that does not render in this
configuration, so a top-level navigation to a PDF would leave the user on a blank
page. `src/main/browser/pdf-navigation-handler.ts` turns such a navigation into a
download instead: on the website sessions it watches `onHeadersReceived` for a
main-frame response with `Content-Type: application/pdf`, cancels the navigation and
asks the same session to download the URL.

Security notes:

- Only the **main frame** is intercepted. A PDF embedded in a page (`<embed>`,
  `<iframe>`) is not turned into a download and simply does not render; that is a
  documented limitation, not a silent rewrite of what the site intended.
- A response that already carries `Content-Disposition: attachment` is left to
  Chromium's own download machinery.
- The interceptor never reads, rewrites or stores the response body. It only
  observes the `Content-Type` header and hands the URL to the session's downloader,
  so the bytes are written by Chromium with the same rules as any other download
  (see section 9 and `THREAT_MODEL.md`, A7).
- The URL is remembered for 15 seconds so the repeated request that starts the
  download is not cancelled a second time; the record is dropped as soon as the
  download begins.
- The cancellation produces a `did-fail-load` with `ERR_BLOCKED_BY_CLIENT` (-20).
  That specific, expected failure is suppressed for the affected URL so it cannot
  be mistaken for a real network error; any other failure still reaches the user.

---

## 8. Credential storage

The AI provider API key is never written to the settings table and never appears in
the database in clear text.

`src/main/security/credential-store.ts`:

- If `safeStorage.isEncryptionAvailable()` is true (the normal case on Windows),
  the secret is encrypted with DPAPI and stored as a BLOB in the `secrets` table.
  The ciphertext is bound to the current Windows user account.
- If the OS store is unavailable, the secret is kept **in memory only** for the
  session and the application reports
  `E_CREDENTIAL_STORE_UNAVAILABLE` — the key is never written to disk unencrypted.
- The plain text is cached in memory for the lifetime of the process and never logged.
- The logger redacts any field whose name matches
  `/key|token|secret|password|authorization|cookie|apikey/i`.

**Honest limits:** DPAPI is not hardware-bound. An attacker who already runs code as
the same Windows user can usually call the same API. This protects the key at rest
against casual inspection, backup snooping and other-user access — not against a
compromised user account.

---

## 9. Data handling

| Data | Where it goes | Notes |
| --- | --- | --- |
| Bookmarks, history, downloads, snippets, collections | `%APPDATA%\Nexus Browser\nexus.db` | Local only. |
| AI conversations | Same database | Local only, unless a provider is configured. |
| AI API key | Windows Credential Manager (DPAPI) | Never in the settings table. |
| Page context | The configured AI endpoint | Only when the user asks the assistant to use page context. |
| Cookies and site storage | The default Chromium session in `%APPDATA%\Nexus Browser` (private windows stay in memory) | Same as any browser. |
| Favicons | Fetched by the main process with the default session | Converted to `data:` URLs; the renderer never contacts the icon host. |
| Developer API requests | The requested host | No cookies, no credentials, `http:`/`https:` only, 10 MB response cap. |

Nothing is sent to a Nexus-owned server. There is no telemetry, no crash reporting and
no update check.

---

## 10. Logging

`src/main/utils/logger.ts`:

- String values are truncated at 500 characters.
- Object keys that look like secrets are replaced with `[redacted]`.
- Errors are logged with a message and structured context, never with a stack that
  could contain a URL with embedded credentials.

---

## 11. What is verified, and how

| Control | Verification |
| --- | --- |
| Scheme blocking | `tests/security/navigation.test.ts` — 30+ hostile URLs. |
| Control-character smuggling | `tests/security/navigation.test.ts`. |
| IPC sender validation | `tests/security/ipc-contract.test.ts` (static assertion) + the handler code path. |
| IPC payload validation | `tests/unit/schemas.test.ts` — 28 schema assertions. |
| Preload does not leak `ipcRenderer` | `tests/security/ipc-contract.test.ts` (static assertion). |
| Every declared channel has a handler | `tests/security/ipc-contract.test.ts`. |
| The preload only uses declared channels | `tests/security/ipc-contract.test.ts`. |
| API key never in an error message | `tests/security/ai-provider.test.ts`. |
| API key only in the `Authorization` header | `tests/security/ai-provider.test.ts`. |
| Invalid endpoint is rejected before any request | `tests/security/ai-provider.test.ts`. |
| The mock provider is always labelled | `tests/security/ai-provider.test.ts`. |
| Download filenames cannot escape the directory | `tests/security/download-filename.test.ts`. |
| Downloads never overwrite an existing file | `tests/security/download-save-path.test.ts`. |
| A PDF navigation downloads instead of leaving a blank tab | `tests/e2e/browser-behaviour.spec.ts` (`PDF downloads`). |
| Foreign keys are enforced | `tests/integration/database.test.ts`. |

See [`FEATURE_VERIFICATION.md`](FEATURE_VERIFICATION.md) for the complete list,
including the controls that are **not** covered by an automated test.

---

## 12. Reporting a vulnerability

Please report security issues privately rather than in a public issue tracker. Include
the Nexus version, the steps to reproduce, and the impact you observed.

Do not include real API keys, real cookies or real personal data in a report —
reproduce with synthetic data instead.

---

## 13. Known security limitations

These are real and are not worked around silently:

1. **No code signing.** The binary is unsigned, so it cannot be verified as coming
   from the Nexus project. An attacker who can replace the executable can run
   arbitrary code as the user.
2. **No auto-updater.** Security fixes have to be installed manually.
3. **DPAPI is not hardware-bound.** See section 8.
4. **Favicons are fetched with the default session**, so the favicon request carries
   the cookies of the default session.
5. **The developer HTTP client can reach private network hosts.**
   `isLocalTarget()` exists to *flag* such targets in the UI, but the request is
   still made. It is a developer tool that is only reachable from the application
   shell.
6. **The shell CSP allows `'unsafe-inline'` for styles.** Tailwind's runtime and the
   React tree need it. `script-src` remains `'self'` only, which is the directive
   that matters for XSS.
7. **No extension support**, therefore no extension-based attack surface — but also
   no extension security review.
8. **Chromium is not hardened beyond Electron's defaults.** No `--disable-features`
   flags are applied, so a Chromium vulnerability affects Nexus as it would affect any
   Electron application.
9. **A PDF embedded in a page does not render.** Electron's bundled Chromium PDF
   viewer does not work in this configuration. Top-level PDF links now download
   (section 7.2), but an `<embed>`/`<iframe>` PDF leaves an empty frame in the page.
