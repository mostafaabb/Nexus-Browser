# Threat model

This document describes what Nexus Browser protects, who it protects it from, which
attacks it mitigates, and — just as importantly — which attacks it does **not**
mitigate.

The threat model is written for the shipped configuration: a single Windows desktop
user running the packaged application, with the default settings and no extensions.

---

## 1. Scope

### In scope

- The Electron main process.
- The preload script and the context bridge.
- The React application shell (renderer).
- Website views (`WebContentsView`).
- The local SQLite database and the Chromium profile.
- The IPC surface.
- The AI subsystem (context extraction, provider requests, credential storage).
- The developer HTTP client.
- Download handling.

### Out of scope

- The security of the operating system itself.
- The security of the user's Windows account.
- The security of remote websites (Nexus does not make a malicious site safe).
- The security of third-party AI providers (data leaves the machine under the user's
  explicit configuration).
- Physical attacks (a compromised kernel, a debugger on the user's session).
- Social engineering of the user.
- Supply-chain attacks on the npm registry itself.

---

## 2. Assets

| Asset | Why it matters | Where it lives |
| --- | --- | --- |
| **Browsing history** | Reveals the user's interests, health, finances and relationships. | `nexus.db`, table `history` |
| **Cookies and session tokens** | Allow account takeover if stolen. | Chromium profile, `%APPDATA%\Nexus Browser\Partitions\default` |
| **AI provider API key** | Direct financial exposure if abused. | Windows Credential Manager (DPAPI) |
| **AI conversations** | May contain sensitive content the user pasted. | `nexus.db`, table `ai_messages` |
| **Bookmarks, snippets, collections** | May contain internal URLs, credentials in snippets, proprietary requests. | `nexus.db` |
| **Downloaded files** | Arbitrary content fetched from the network. | User-chosen directory |
| **Application integrity** | A modified binary can capture everything above. | `%LOCALAPPDATA%\Programs\Nexus Browser` |

---

## 3. Adversaries

| # | Adversary | Capability | Motivation |
| --- | --- | --- | --- |
| **A1** | **Malicious website** | Arbitrary JavaScript in a website view. Wants to read data, escalate into the shell, or phish. | Theft of browsing data, credential harvesting, privilege escalation. |
| **A2** | **Compromised website dependency** | A third-party script served by a legitimate site. Same capabilities as A1, but arrives without the user noticing. | Tracking, session hijacking. |
| **A3** | **Network attacker** | Passive observation or active TLS interception with a certificate the user ignores. | Read and modify traffic. |
| **A4** | **Local attacker, different user** | Access to the machine's filesystem but not the user's session. | Read the database, steal the API key. |
| **A5** | **Local attacker, same user** | Code execution as the same Windows account. | Steal cookies, read the decrypted API key, patch the binary. |
| **A6** | **Malicious AI provider** | The endpoint the user configured returns hostile content. | Prompt injection into the UI, data exfiltration via markdown links. |
| **A7** | **Malicious download** | A file served by a site that the user downloads and executes. | Run arbitrary code with user privileges. |

---

## 4. Trust boundaries

```
   ┌───────────────────────────────────────────────────────────────┐
   │  B1  User interface / website content boundary                │
   │      Website view  ⇄  application shell (different partitions) │
   └───────────────────────────────────────────────────────────────┘
   ┌───────────────────────────────────────────────────────────────┐
   │  B2  Renderer / main process boundary                          │
   │      contextBridge + validated IPC                            │
   └───────────────────────────────────────────────────────────────┘
   ┌───────────────────────────────────────────────────────────────┐
   │  B3  Application / operating system boundary                   │
   │      safeStorage, filesystem permissions, shell.openExternal   │
   └───────────────────────────────────────────────────────────────┘
   ┌───────────────────────────────────────────────────────────────┐
   │  B4  Application / network boundary                            │
   │      Chromium's TLS stack, AI provider endpoint, dev client    │
   └───────────────────────────────────────────────────────────────┘
   ┌───────────────────────────────────────────────────────────────┐
   │  B5  Application / disk boundary                               │
   │      nexus.db, Chromium profile, export files              │
   └───────────────────────────────────────────────────────────────┘
```

---

## 5. Attack surface and mitigations

### 5.1 Malicious website (A1, A2) → the application shell

**Attack.** The site executes JavaScript in its own view and tries to reach the shell:
read `window.nexus`, navigate the shell, open a native window, or trigger a privileged
IPC call.

**Mitigations.**

- The website view has **no preload script** — there is no `window.nexus` to find.
- `contextIsolation: true` means the page's `window` is not the same object the
  preload sees.
- `sandbox: true` and `nodeIntegration: false` mean no Node.js primitives.
- The shell and the website live in **different session partitions**, so cookies,
  storage and service workers are not shared.
- The shell's `setWindowOpenHandler` denies everything and its `will-navigate` handler
  refuses to leave the bundled document.
- The shell's CSP is `default-src 'none'`, so even an injected script in the shell
  cannot exfiltrate anything over the network.

**Residual risk.** The renderer *is* application code that renders untrusted strings
(URLs, page titles, bookmark names, AI output). Any XSS in the shell would be serious.
Mitigations: React escapes by default, no `dangerouslySetInnerHTML` is used anywhere
in the renderer, and the CSP blocks network exfiltration. A code review should keep it
that way.

### 5.2 Malicious website → privileged navigation

**Attack.** The site navigates the top frame to `file:///C:/…`, `javascript:…` or a
`data:` URL, or redirects to one.

**Mitigations.**

- `will-navigate` and `will-redirect` are both filtered by `isNavigable()`, which
  requires `http:`/`https:` and rejects every URL with control characters.
- The address bar resolves input through the same allow list, so the user cannot be
  tricked into typing a dangerous URL that then reaches Chromium.
- `setWindowOpenHandler` denies all new windows; the URL is handed to the application
  instead, which re-validates it.

**Residual risk.** `http:` URLs are allowed, so plaintext traffic and mixed content
remain possible — exactly as in any browser. The security status indicator in the
status bar shows `Secure` or `Not secure` accordingly.

### 5.3 Malicious website → native execution

**Attack.** The site tries to open a local file, run a protocol handler or launch an
executable.

**Mitigations.**

- `app:openExternal` validates that the URL is `http:`, `https:` or `mailto:` before
  calling `shell.openExternal`. Every other scheme — including `javascript:`, `data:`
  and `file:` — is rejected, and URLs that contain control characters are rejected
  before the scheme is even parsed.
- `app:openPath` and `app:revealPath` only accept paths that already exist and are
  invoked from explicit user actions, not from a website.
- The `openExternal` **permission** is in the sensitive list, so a site cannot even
  ask to open a URL without an explicit decision.

**Residual risk.** If the user explicitly approves an `openExternal` prompt for an
attacker-controlled URL, the OS may launch a protocol handler. This is a user
decision, and the prompt shows the origin.

### 5.4 Compromised renderer → privilege escalation

**Attack.** The renderer (through an XSS or a malicious dependency) calls privileged
IPC with forged arguments.

**Mitigations.**

- Every handler validates the **sender**; a call from a non-Nexus window is rejected
  with `E_UNAUTHORIZED_SENDER`.
- Every payload is **Zod-validated**; unknown keys are stripped.
- Numeric ranges are enforced (layout coordinates, zoom factors, timeouts).
- The layout channel is capped at 8 entries, so the renderer cannot spawn views.
- The shell cannot reach the filesystem except through the enumerated file channels,
  which require explicit user actions.

**Residual risk.** A compromised renderer can still *ask* for things. It cannot forge
a decision that the user did not make, but it can make the request.

### 5.5 Network attacker (A3) → traffic

**Attack.** Passive reading of traffic, or an active MITM with an installed root
certificate.

**Mitigations.**

- Chromium's TLS stack handles all website traffic with modern defaults.
- `certificate-error` is **never** bypassed — there is no "continue anyway" path, so
  an interception attempt produces a hard error rather than a click-through.
- The AI endpoint is validated to be `http:`/`https:` and the API key is only sent to
  the configured endpoint.

**Residual risk.** If the user has installed a trusted root certificate, TLS provides
no protection against an active attacker. The developer HTTP client is a plain
`fetch()` and behaves the same way.

### 5.6 Local attacker, different user (A4) → at-rest data

**Attack.** Read the database and the Chromium profile from the filesystem.

**Mitigations.**

- The API key is encrypted with DPAPI and is bound to the user's account; another
  Windows account cannot decrypt it through `safeStorage`.
- The database and the profile live under `%APPDATA%`, which is per-user and
  protected by the default NTFS ACLs.

**Residual risk.** **The browsing history, bookmarks and AI conversations are stored
in clear text in the SQLite file.** A local attacker with a copy of the file — from a
backup, a synced folder, or a stolen drive — can read all of it. Only the AI API key
is protected at rest. Full-disk encryption is the user's responsibility.

### 5.7 Local attacker, same user (A5) → everything

**Attack.** Run code as the user: read the decrypted API key, read cookies from the
Chromium profile, patch the executable.

**Mitigations.** Very little, by design. The application does not attempt to defend
against code execution as the user.

**Residual risk.** This is the accepted residual risk of a desktop browser. It is why
the application is **not code signed** in this release (see below) and why the
honest recommendation is to run the browser as a standard (non-administrator) user
account.

### 5.8 Malicious AI provider (A6) → the user interface

**Attack.** The configured endpoint returns content that tries to trick the user —
phishing links presented as assistant output, instructions that the user follows, or
an oversized response.

**Mitigations.**

- The assistant output is rendered as text by React. No HTML from a provider is ever
  injected, so a provider cannot execute script in the shell.
- The shell CSP blocks `frame-src`, `object-src` and `media-src`, so a provider cannot
  embed active content.
- The provider response body is size-limited by the HTTP client timeout and the
  response reader.
- A failed request produces a typed error, not a crash.

**Residual risk.** A provider can still return *persuasive text* with links. The user
is the last line of defence there, and the UI does not render provider output as
clickable links.

### 5.9 Malicious download (A7)

**Attack.** A served file tricks the user into executing it.

**Mitigations.**

- The download filename is sanitised: directory components are removed, Windows
  reserved characters are replaced, control characters are stripped, leading dots are
  removed and the length is capped. A file can therefore never be written outside the
  chosen directory.
- The file is written by Chromium's download machinery into a user-visible directory,
  and the user chooses whether to execute it.

**Residual risk.** Nexus does not scan downloads and does not attach a "safe" mark.
The usual Windows SmartScreen and antivirus protections apply.

### 5.10 Prompt injection via page content

**Attack.** A page contains text that instructs the assistant to ignore the user's
request and exfiltrate data.

**Mitigations.**

- Page content is marked as context and the system prompt states that context is
  untrusted data, not instructions.
- The context bundle is truncated to 24 000 characters, which bounds the size of the
  injected block.
- The mock provider never performs actions.

**Residual risk.** **Prompt injection is not solved.** It is a property of language
models, not of this application. A real provider may follow instructions found in page
content. Nexus does not give the assistant any tool access — it can only read and
write text — which limits what a successful injection can achieve, but it cannot
prevent the model from being misled.

---

## 6. Abuse cases by feature

| Feature | Abuse case | Control |
| --- | --- | --- |
| AI assistant | Send the user's page content to a third party without them realising | Context is only attached when the user asks for it or explicitly enables it; the panel always lists what is attached. |
| Developer HTTP client | Use the browser as a proxy into the internal network | The tool is a deliberate developer feature; it never sends browser cookies; the UI flags private-network targets. |
| Import/export | Import a malicious bookmarks HTML or collection JSON | Import is size-limited (5 MB), parsed with a tolerant parser and every item is validated before insertion. |
| Bookmarks | A bookmark title contains a phishing URL | Titles are rendered as text; the URL is only opened after an explicit click. |
| History | A site poisons the history with misleading titles | Titles come from the site and are displayed as-is; the URL is always shown separately. |

---

## 7. Accepted risks

| Risk | Rationale |
| --- | --- |
| **No code signing** | A signing certificate requires a paid, identity-verified organisation. Until there is one, the honest state is an unsigned binary that SmartScreen flags. |
| **No auto-updater** | Auto-update requires a signed release channel. Manual updates keep the trust model simple: the user decides when to replace the binary. |
| **Clear-text history and bookmarks** | Encrypting the whole database would break the "your data is a plain file you can back up" property and add a key-management problem with no real benefit against a local attacker, who can read the key anyway. |
| **Private browsing is not anonymity** | Documented explicitly in the UI and the README. Nexus prevents *local storage*, not observation. |
| **Workspaces share cookies** | A per-workspace cookie jar would break logins when a user moves a tab between workspaces. Documented as an organisational, not a security, feature. |
| **Favicons fetched with the default session** | The alternative — a cookie-free fetch — would break sites that gate their favicon behind a login. The trade-off is documented in `SECURITY.md`. |
| **The developer client can reach private networks** | It is a developer tool. Blocking it would make the tool useless for the API testing it exists for. The risk is flagged in the UI. |

---

## 8. Recommendations for the user

1. Run Nexus as a **standard, non-administrator** Windows account.
2. Use **private windows** for anything that must not be stored locally — and
   remember that this does not hide traffic from the network.
3. Enable **full-disk encryption** if the machine can be lost or stolen.
4. Do not install untrusted root certificates.
5. Review **Settings → Permissions** periodically and revoke what you no longer need.
6. Keep the application up to date manually — there is no auto-updater.
7. Use a **separate, low-value API key** for the assistant if your provider supports
   key rotation and usage limits.
