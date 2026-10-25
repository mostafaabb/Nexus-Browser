# AI providers

Nexus ships with two provider adapters. The default one is **fully offline and
explicitly labelled as a simulation**; the second one talks to any service that speaks
the OpenAI `/chat/completions` protocol.

No API key is bundled with the application, and Nexus never contacts a service that
the user has not configured.

---

## 1. Providers

### 1.1 `mock` — Nexus Mock (offline)

| Property | Value |
| --- | --- |
| Network access | **None.** |
| API key | Not required. |
| Streaming | Yes. |
| Default | Yes. |

The mock provider produces a structured, obviously synthetic answer. Every response
starts with a banner like:

> **Mock response** — generated offline by Nexus. No external AI service was
> contacted. Configure a provider in Settings → AI to get real answers.

It is a *simulation*: it echoes the shape of an answer (a title, bullet points, a
takeaway) and it never claims to have understood the content. It exists so that the
assistant UI is usable and testable without an account, and so that nobody can
mistake its output for a real model.

The labelling is enforced by a test (`tests/security/ai-provider.test.ts`), so the
banner cannot be removed by accident.

### 1.2 `openai-compatible` — OpenAI-compatible API

| Property | Value |
| --- | --- |
| Network access | To the endpoint you configure. |
| API key | Required. |
| Streaming | Yes (Server-Sent Events). |
| Protocol | `POST {endpoint}/chat/completions` |

This adapter works with OpenAI itself and with any service that implements the same
request and response shape — Ollama, LM Studio, vLLM, OpenRouter, Together, Groq,
llama.cpp's server and similar gateways.

---

## 2. Configuration

Open **Settings → AI**.

| Field | Meaning |
| --- | --- |
| **Provider** | `mock` or `openai-compatible`. |
| **Endpoint** | The base URL, e.g. `https://api.openai.com/v1` or `http://localhost:11434/v1`. |
| **Model** | The model identifier, e.g. `gpt-4o-mini` or `llama3.1`. |
| **API key** | Stored in the Windows Credential Manager. Leave empty to keep the current key. |
| **Extra headers** | Optional headers sent with every request (e.g. `x-api-key` for some gateways). |
| **Timeout** | Milliseconds before the request is aborted. Default 60 000. |
| **Temperature** | `null` = the provider default. |
| **Max tokens** | `null` = the provider default. |
| **Streaming** | Toggle the incremental delivery of the answer. |

A **Test connection** button performs a real, minimal request (`"Reply with the single
word: ready"`) and reports the latency and the reply.

### How the endpoint is resolved

```
{endpoint}/chat/completions
```

A trailing slash on the endpoint is removed, so `https://api.example.com/v1/` and
`https://api.example.com/v1` behave identically.

### Endpoint validation

The endpoint must be an absolute `http:` or `https:` URL. Anything else —
`file:///…`, `javascript:…`, a relative path — is rejected **before** any request is
made, and the API key is never sent. This is asserted by a test that spies on
`fetch` and checks that it was not called.

Plain `http:` is allowed on purpose so that a local model server (`http://localhost:…`)
works. The key is still sent to that endpoint over the local network — use a local
server or a trusted network.

---

## 3. How the API key is stored

| Situation | Behaviour |
| --- | --- |
| `safeStorage` is available (the normal case on Windows) | The key is encrypted with **DPAPI** and stored as a BLOB in the `secrets` table. Only the same Windows user can decrypt it. |
| `safeStorage` is unavailable | The key is kept **in memory only** for the session. It is never written to disk. The UI shows a warning and the API returns `E_CREDENTIAL_STORE_UNAVAILABLE`. |

Additional guarantees:

- The key is never written to the `settings` table and never included in an exported
  data bundle.
- The key is sent **only** in the `Authorization: Bearer <key>` header. It never
  appears in a request body, a query string or a log line.
- Error messages are constructed so that the key can never leak into them. This is
  asserted by a test that triggers a network failure and inspects the message.
- The logger redacts any field whose name matches
  `/key|token|secret|password|authorization|cookie|apikey/i`.

**Limit:** DPAPI is bound to the Windows user account, not to the hardware. An
attacker who already runs code as the same user can usually decrypt the key. This
protects the key at rest, not against a compromised account.

---

## 4. What data is sent to a provider

This is the part worth reading carefully.

### 4.1 What is always sent

- The **system prompt** (a fixed, application-owned text).
- The **last 12 messages** of the current conversation (roles and content).
- The **user's prompt**.

### 4.2 What is sent only on request

Page context is attached **only** when the user asks for it:

| Source | How it is obtained |
| --- | --- |
| **Selection** | The current text selection of the active website view. |
| **Reader** | The main article text of the active page. |
| **Page** | The visible text of the active page (fallback when the reader extraction finds too little). |
| **Tabs** | The same extraction for several selected tabs. |
| **Pasted** | Text the user typed or pasted into the assistant input. |

The extraction runs with `executeJavaScriptInIsolatedWorld(9999, …)`, in a separate
JavaScript world that the page cannot reach. The page cannot override the extraction
functions or forge the result.

### 4.3 Limits

| Limit | Value |
| --- | --- |
| Maximum total context characters | 24 000 (`MAX_AI_CONTEXT_CHARS`) |
| Maximum user input characters | 8 000 (`MAX_AI_USER_INPUT_CHARS`) |
| Maximum context blocks per request | 32 (enforced by `zAiSendRequest`) |
| Timeout | Configurable, 60 000 ms by default |

When the bundle is larger than the limit, every block is shortened proportionally and
marked as truncated. The truncation is visible in the user interface.

### 4.4 What is never sent

- Cookies, passwords or any other browser credential.
- The browsing history, bookmarks or downloads.
- Anything from another application.
- The API key of a *different* provider (there is only one).

### 4.5 Prompt injection

The system prompt states explicitly that text inside `<page-context>` blocks is
untrusted data and that instructions found there must not be followed. The assistant
has **no tools**: it cannot browse, run code, read files, change settings or call any
privileged API.

This reduces the impact of an injection, but it does not eliminate it — prompt
injection is a property of language models. See
[`THREAT_MODEL.md`](THREAT_MODEL.md) section 5.10.

---

## 5. The assistant actions

The nine one-click actions in the panel map to fixed prompt templates in
`src/shared/constants/ai-actions.ts`.

| Action | What it does |
| --- | --- |
| **Summarise** | A short title, 3–6 bullet points, one takeaway sentence. |
| **Explain** | Explains the selected text for a non-expert and flags ambiguity. |
| **Key facts** | Names, numbers, dates and verifiable claims — nothing inferred. |
| **Notes** | Structured notes with headings and bullets, original order preserved. |
| **Study questions** | 5–8 comprehension questions with answers. |
| **Explain code** | Step-by-step explanation of a snippet: inputs, outputs, side effects, problems. |
| **Summarise docs** | Purpose, key concepts, the main API, what a newcomer must know. |
| **Summarise tabs** | Summarises several pages together and relates them. |
| **Compare pages** | A table of differences plus a list of similarities. |

Each action declares which context kinds it needs. The panel only offers an action
when the required context is available.

---

## 6. Streaming and cancellation

- The provider streams Server-Sent Events; each delta is forwarded to the renderer as
  an `ai:chunk` event and appended to the assistant message.
- The store handles chunks that arrive **before** the `send()` promise resolves, so no
  text is lost.
- **Stop** aborts the request through an `AbortController`. The partial answer is kept
  with the status `cancelled` and the message is marked as cancelled in the database.
- A failed request keeps the partial text and stores the error message; it never
  produces a silent empty answer.

---

## 7. Conversations

- Conversations are stored in `ai_conversations` and `ai_messages`.
- They can be renamed, cleared and deleted.
- **Save AI conversations** in the settings can be turned off; the assistant then keeps
  the conversation in memory for the session only.
- Conversations are included in the data export. The API key is not.

---

## 8. Using a local model

The adapter works with a local server that speaks the OpenAI protocol.

```bash
# Ollama
ollama serve
# then set the endpoint to http://localhost:11434/v1 and the model to e.g. llama3.1
```

```bash
# LM Studio (local server)
# then set the endpoint to http://localhost:1234/v1
```

The key field can be left empty **only** for the mock provider. For a local server
that does not check the key, enter any non-empty placeholder — but note that it is
still stored in the credential manager and still sent in the `Authorization` header.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `E_AI_NOT_CONFIGURED` — "No API key is stored" | The key was never set or was cleared. | Enter the key in Settings → AI. |
| `E_AI_NOT_CONFIGURED` — "No endpoint is configured" | The endpoint is empty. | Enter the base URL of the provider. |
| `E_NETWORK_ERROR` | The host could not be reached. | Check the endpoint, the network and any proxy. |
| `E_TIMEOUT` | The provider did not answer in time. | Increase the timeout or use a faster model. |
| `E_AI_INVALID_RESPONSE` | The provider did not return the expected shape. | Confirm that the endpoint really is an OpenAI-compatible `/chat/completions`. |
| The answer is the mock banner | The provider is still `mock`. | Switch the provider in Settings → AI and press Test connection. |
| A local model returns an error about the model name | The model identifier does not exist on the server. | Use the exact identifier the server reports (`ollama list` for Ollama). |

---

## 10. Adding another provider

1. Create `src/main/ai/providers/my-provider.ts` implementing `AiProvider`:
   ```ts
   export class MyProvider implements AiProvider {
     readonly id = 'my-provider'
     readonly displayName = 'My provider'
     readonly requiresApiKey = true
     readonly supportsStreaming = false
     async complete(request: CompletionRequest): Promise<ProviderResult> { /* … */ }
   }
   ```
2. Add the identifier to `AiProviderId` in `src/shared/types/ai.ts`.
3. Return it from `AiService.createProvider()`.
4. Validate the endpoint before the request and never include the key in an error
   message.
5. Add tests in `tests/security/` that prove the key does not leak.

The `ProviderResult` type carries `content`, `usage` and `streamed`, so the rest of
the application works unchanged.
