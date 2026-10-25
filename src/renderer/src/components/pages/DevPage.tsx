import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Copy,
  FolderPlus,
  Play,
  Plus,
  Save,
  Send,
  Square,
  Trash,
  Upload,
  Download
} from 'lucide-react'
import type {
  ApiCollection,
  ApiRequestRecord,
  HeaderEntry,
  HttpMethod,
  HttpRequestHistoryEntry,
  HttpResponsePayload,
  QueryParam
} from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { PageShell } from './PageShell'
import { Button, IconButton } from '../ui/Button'
import { Input, Label, Select, TextArea } from '../ui/Input'
import { Badge, EmptyState } from '../ui/Feedback'
import { formatBytes, formatDuration, formatRelativeTime } from '../../lib/format'
import { cn } from '../../lib/cn'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

function newQueryParam(): QueryParam {
  return { id: `q-${Math.random().toString(36).slice(2)}`, key: '', value: '', enabled: true }
}

function newHeader(): HeaderEntry {
  return { id: `h-${Math.random().toString(36).slice(2)}`, key: '', value: '', enabled: true }
}

export function DevPage(): React.JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)

  const [tab, setTab] = useState<'client' | 'snippets'>('client')
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState<QueryParam[]>([])
  const [headers, setHeaders] = useState<HeaderEntry[]>([])
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'text' | 'form'>('none')
  const [body, setBody] = useState('')
  const [timeoutMs, setTimeoutMs] = useState(30_000)

  const [response, setResponse] = useState<HttpResponsePayload | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [collections, setCollections] = useState<ApiCollection[]>([])
  const [savedRequests, setSavedRequests] = useState<ApiRequestRecord[]>([])
  const [history, setHistory] = useState<HttpRequestHistoryEntry[]>([])
  const [activeCollection, setActiveCollection] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextCollections, nextRequests, nextHistory] = await Promise.all([
        nexus.dev.listCollections(),
        nexus.dev.listRequests(activeCollection),
        nexus.dev.httpHistory()
      ])
      setCollections(nextCollections)
      setSavedRequests(nextRequests)
      setHistory(nextHistory)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [activeCollection, pushToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const send = async (): Promise<void> => {
    if (!url.trim()) {
      pushToast('Enter a URL first.', 'error')
      return
    }
    setSending(true)
    setRequestError(null)
    try {
      const result = await nexus.dev.sendRequest({
        method,
        url: url.trim(),
        query: query.filter((item) => item.enabled && item.key.trim()),
        headers: headers.filter((item) => item.enabled && item.key.trim()),
        bodyType,
        body: bodyType === 'none' ? '' : body,
        timeoutMs
      })
      if (result.error) {
        setRequestError(result.error)
        setResponse(null)
      } else {
        setResponse(result.response)
      }
      await refresh()
    } catch (error) {
      setRequestError(errorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const saveRequest = async (): Promise<void> => {
    if (!url.trim()) {
      pushToast('Enter a URL first.', 'error')
      return
    }
    const name = window.prompt('Name this request', `${method} ${url}`)
    if (!name?.trim()) return
    try {
      await nexus.dev.saveRequest({
        id: undefined,
        record: {
          collectionId: activeCollection,
          name: name.trim(),
          method,
          url: url.trim(),
          query,
          headers,
          bodyType,
          body,
          notes: ''
        }
      })
      await refresh()
      pushToast('Request saved.', 'success')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const loadRequest = (record: ApiRequestRecord): void => {
    setMethod(record.method)
    setUrl(record.url)
    setQuery(record.query)
    setHeaders(record.headers)
    setBodyType(record.bodyType)
    setBody(record.body)
  }

  const prettyBody = useMemo(() => {
    if (!response) return ''
    if (response.bodyIsJson && response.json !== null) {
      try {
        return JSON.stringify(response.json, null, 2)
      } catch {
        return response.body
      }
    }
    return response.body
  }, [response])

  return (
    <PageShell
      title="Developer toolkit"
      subtitle="A local HTTP client and snippet library. Requests are sent from this machine."
      actions={
        <div className="flex gap-1 rounded-md border border-line bg-surface-2 p-0.5">
          {(['client', 'snippets'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                'rounded px-2.5 py-1 text-[12px] transition-colors',
                tab === item ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              )}
              onClick={() => setTab(item)}
            >
              {item === 'client' ? 'HTTP client' : 'Snippets'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'client' ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Collections
                </h2>
                <IconButton
                  label="New collection"
                  size="sm"
                  onClick={() => {
                    const name = window.prompt('Collection name')
                    if (!name?.trim()) return
                    void nexus.dev
                      .createCollection(name.trim())
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </IconButton>
              </div>
              <ul className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded px-2 py-1 text-left text-[12px] transition-colors',
                      activeCollection === null
                        ? 'bg-accent/15 text-accent'
                        : 'text-ink hover:bg-surface-2'
                    )}
                    onClick={() => setActiveCollection(null)}
                  >
                    All requests
                  </button>
                </li>
                {collections.map((collection) => (
                  <li key={collection.id} className="group flex items-center">
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 rounded px-2 py-1 text-left text-[12px] transition-colors',
                        activeCollection === collection.id
                          ? 'bg-accent/15 text-accent'
                          : 'text-ink hover:bg-surface-2'
                      )}
                      onClick={() => setActiveCollection(collection.id)}
                    >
                      <span className="block truncate">{collection.name}</span>
                      <span className="block text-[10.5px] text-ink-subtle">
                        {collection.requestCount} request
                        {collection.requestCount === 1 ? '' : 's'}
                      </span>
                    </button>
                    <IconButton
                      label="Delete the collection"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        void nexus.dev
                          .deleteCollection(collection.id)
                          .then(refresh)
                          .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                      }}
                    >
                      <Trash className="h-3 w-3" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Saved requests
              </h2>
              {savedRequests.length === 0 ? (
                <p className="text-[11.5px] text-ink-subtle">Nothing saved yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {savedRequests.map((record) => (
                    <li key={record.id} className="group flex items-center">
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded px-2 py-1 text-left transition-colors hover:bg-surface-2"
                        onClick={() => loadRequest(record)}
                      >
                        <span className="block truncate text-[12px] text-ink">{record.name}</span>
                        <span className="block truncate text-[10.5px] text-ink-subtle">
                          {record.method} {record.url}
                        </span>
                      </button>
                      <IconButton
                        label="Delete the request"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          void nexus.dev
                            .deleteRequest(record.id)
                            .then(refresh)
                            .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                        }}
                      >
                        <Trash className="h-3 w-3" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  History
                </h2>
                <IconButton
                  label="Clear the history"
                  size="sm"
                  onClick={() => {
                    void nexus.dev
                      .clearHttpHistory()
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Trash className="h-3 w-3" />
                </IconButton>
              </div>
              {history.length === 0 ? (
                <p className="text-[11.5px] text-ink-subtle">No requests sent yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {history.slice(0, 12).map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="w-full rounded px-2 py-1 text-left transition-colors hover:bg-surface-2"
                        onClick={() => {
                          setMethod(entry.method)
                          setUrl(entry.url)
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          <Badge
                            tone={
                              entry.error
                                ? 'danger'
                                : entry.status && entry.status >= 400
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {entry.method}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">
                            {entry.url}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-ink-subtle">
                          {entry.status ?? 'failed'} · {formatDuration(entry.durationMs)} ·{' '}
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Import / export
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void nexus.dev
                      .exportCollections()
                      .then((result) =>
                        nexus.app
                          .saveTextFile(result.content, result.fileName, [
                            { name: 'Nexus collections', extensions: ['json'] }
                          ])
                          .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                      )
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void nexus.app
                      .openTextFile([{ name: 'Nexus collections', extensions: ['json'] }])
                      .then((file) => {
                        if (!file) return
                        return nexus.dev
                          .importCollections(file.content, file.fileName)
                          .then((result) => {
                            pushToast(
                              `Imported ${result.imported} items (${result.skipped} skipped).`,
                              'success'
                            )
                            return refresh()
                          })
                      })
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </Button>
              </div>
            </section>
          </aside>

          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-3">
              <div className="flex gap-2">
                <Select
                  value={method}
                  className="w-28"
                  onChange={(event) => setMethod(event.target.value as HttpMethod)}
                >
                  {METHODS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Input
                  value={url}
                  placeholder="https://api.example.com/v1/resource"
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void send()
                  }}
                />
                <Button variant="primary" disabled={sending} onClick={() => void send()}>
                  {sending ? <Square className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
                <IconButton label="Save the request" onClick={() => void saveRequest()}>
                  <Save className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <Label>Query parameters</Label>
                    <IconButton
                      label="Add a query parameter"
                      size="sm"
                      onClick={() => setQuery([...query, newQueryParam()])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <div className="space-y-1">
                    {query.map((param) => (
                      <div key={param.id} className="flex gap-1">
                        <input
                          aria-label="Parameter name"
                          placeholder="name"
                          value={param.key}
                          className="h-7 w-1/3 rounded border border-line bg-surface-2 px-2 text-[11.5px] focus:border-accent focus:outline-none"
                          onChange={(event) =>
                            setQuery(
                              query.map((item) =>
                                item.id === param.id ? { ...item, key: event.target.value } : item
                              )
                            )
                          }
                        />
                        <input
                          aria-label="Parameter value"
                          placeholder="value"
                          value={param.value}
                          className="h-7 min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 text-[11.5px] focus:border-accent focus:outline-none"
                          onChange={(event) =>
                            setQuery(
                              query.map((item) =>
                                item.id === param.id ? { ...item, value: event.target.value } : item
                              )
                            )
                          }
                        />
                        <IconButton
                          label="Remove the parameter"
                          size="sm"
                          onClick={() => setQuery(query.filter((item) => item.id !== param.id))}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    ))}
                    {query.length === 0 ? (
                      <p className="text-[11px] text-ink-subtle">No query parameters.</p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <Label>Headers</Label>
                    <IconButton
                      label="Add a header"
                      size="sm"
                      onClick={() => setHeaders([...headers, newHeader()])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <div className="space-y-1">
                    {headers.map((header) => (
                      <div key={header.id} className="flex gap-1">
                        <input
                          aria-label="Header name"
                          placeholder="Content-Type"
                          value={header.key}
                          className="h-7 w-1/3 rounded border border-line bg-surface-2 px-2 text-[11.5px] focus:border-accent focus:outline-none"
                          onChange={(event) =>
                            setHeaders(
                              headers.map((item) =>
                                item.id === header.id ? { ...item, key: event.target.value } : item
                              )
                            )
                          }
                        />
                        <input
                          aria-label="Header value"
                          placeholder="application/json"
                          value={header.value}
                          className="h-7 min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 text-[11.5px] focus:border-accent focus:outline-none"
                          onChange={(event) =>
                            setHeaders(
                              headers.map((item) =>
                                item.id === header.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                        <IconButton
                          label="Remove the header"
                          size="sm"
                          onClick={() =>
                            setHeaders(headers.filter((item) => item.id !== header.id))
                          }
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    ))}
                    {headers.length === 0 ? (
                      <p className="text-[11px] text-ink-subtle">No custom headers.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {method !== 'GET' && method !== 'HEAD' ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Label>Body</Label>
                    <Select
                      value={bodyType}
                      className="h-7 w-28 text-[11.5px]"
                      onChange={(event) =>
                        setBodyType(event.target.value as 'none' | 'json' | 'text' | 'form')
                      }
                    >
                      <option value="none">None</option>
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="form">Form</option>
                    </Select>
                  </div>
                  {bodyType !== 'none' ? (
                    <TextArea
                      rows={5}
                      value={body}
                      className="font-mono text-[11.5px]"
                      placeholder={bodyType === 'json' ? '{ "key": "value" }' : ''}
                      onChange={(event) => setBody(event.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <Label htmlFor="timeout" className="mb-0">
                  Timeout (ms)
                </Label>
                <Input
                  id="timeout"
                  type="number"
                  value={timeoutMs}
                  className="w-28"
                  onChange={(event) => setTimeoutMs(Number(event.target.value) || 30000)}
                />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Response
                </h2>
                {response ? (
                  <>
                    <Badge
                      tone={
                        response.status >= 500
                          ? 'danger'
                          : response.status >= 400
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {response.status} {response.statusText}
                    </Badge>
                    <span className="text-[11px] text-ink-subtle">
                      {formatDuration(response.durationMs)} · {formatBytes(response.sizeBytes)}
                      {response.contentType ? ` · ${response.contentType}` : ''}
                    </span>
                  </>
                ) : null}
                <span className="flex-1" />
                {response ? (
                  <IconButton
                    label="Copy the response body"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(prettyBody)
                      pushToast('Copied to the clipboard.', 'success')
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                ) : null}
              </div>

              {requestError ? (
                <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  {requestError}
                </p>
              ) : response ? (
                <>
                  {Object.keys(response.headers).length > 0 ? (
                    <details className="mb-2">
                      <summary className="cursor-pointer text-[11.5px] text-ink-muted">
                        Response headers
                      </summary>
                      <pre className="mt-1 overflow-auto rounded bg-surface-2 p-2 font-mono text-[11px] text-ink-muted">
                        {Object.entries(response.headers)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join('\n')}
                      </pre>
                    </details>
                  ) : null}
                  <pre className="max-h-[420px] overflow-auto rounded bg-surface-2 p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-muted">
                    {prettyBody || '(empty body)'}
                  </pre>
                </>
              ) : (
                <EmptyState
                  icon={<Play className="h-7 w-7" />}
                  title="No response yet"
                  description="Send a request to see the status, the headers and the body."
                />
              )}
            </section>
          </div>
        </div>
      ) : (
        <DevSnippets onChanged={refresh} />
      )}
    </PageShell>
  )
}

/** Snippet manager rendered inside the developer page. */
function DevSnippets({ onChanged }: { onChanged: () => Promise<void> }): React.JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [snippets, setSnippets] = useState<Awaited<ReturnType<typeof nexus.dev.listSnippets>>>([])

  const load = useCallback(async (): Promise<void> => {
    try {
      setSnippets(await nexus.dev.listSnippets())
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">Snippets</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void load()
            void onChanged()
          }}
        >
          Refresh
        </Button>
      </div>
      {snippets.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-7 w-7" />}
          title="No snippets yet"
          description="Create snippets from the snippets panel in the sidebar."
        />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {snippets.map((snippet) => (
            <li key={snippet.id} className="rounded-md border border-line bg-surface-2 p-3">
              <p className="text-[12.5px] font-medium text-ink">{snippet.title}</p>
              {snippet.description ? (
                <p className="mb-1 text-[11.5px] text-ink-subtle">{snippet.description}</p>
              ) : null}
              <pre className="max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[11px] text-ink-muted">
                {snippet.code}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
