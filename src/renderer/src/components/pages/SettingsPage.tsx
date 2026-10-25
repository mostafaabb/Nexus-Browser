import { useCallback, useEffect, useState } from 'react'
import {
  Eye,
  EyeOff,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash,
  TriangleAlert
} from 'lucide-react'
import type { AccentColor, AppSettings, PermissionDecisionRecord, ThemeMode } from '@shared/types'
import type { AiProviderConfig } from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { PageShell } from './PageShell'
import { Button, IconButton } from '../ui/Button'
import { Input, Label, Select } from '../ui/Input'
import { Toggle } from '../ui/Toggle'
import { Badge, ErrorNote } from '../ui/Feedback'

const THEMES: Array<{ id: ThemeMode; label: string }> = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Follow the system' }
]

const ACCENTS: Array<{ id: AccentColor; label: string; color: string }> = [
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { id: 'blue', label: 'Blue', color: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' }
]

const PERMISSION_LABELS: Record<string, string> = {
  media: 'Camera and microphone',
  geolocation: 'Location',
  notifications: 'Notifications',
  midi: 'MIDI',
  pointerLock: 'Pointer lock',
  fullscreen: 'Fullscreen',
  openExternal: 'External applications',
  clipboardRead: 'Clipboard access'
}

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-8 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="mb-3 mt-0.5 text-[11.5px] leading-relaxed text-ink-subtle">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function SettingsPage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const pushToast = useAppStore((state) => state.pushToast)
  const info = useAppStore((state) => state.info)

  const [provider, setProvider] = useState<AiProviderConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermissionDecisionRecord[]>([])

  const loadProvider = useCallback(async (): Promise<void> => {
    try {
      setProvider(await nexus.ai.getProviderConfig())
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast])

  const loadPermissions = useCallback(async (): Promise<void> => {
    try {
      setPermissions(await nexus.permissions.list())
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast])

  useEffect(() => {
    void loadProvider()
    void loadPermissions()
  }, [loadProvider, loadPermissions])

  if (!settings) {
    return (
      <PageShell title="Settings">
        <p className="text-[12px] text-ink-subtle">Loading the settings…</p>
      </PageShell>
    )
  }

  const set = (patch: Partial<AppSettings>): void => {
    void updateSettings(patch)
  }

  const testProvider = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await nexus.ai.testProvider()
      setTestResult(
        result.ok
          ? `Provider responded in ${Math.round(result.latencyMs)} ms.`
          : `Provider failed: ${result.message}`
      )
    } catch (error) {
      setTestResult(errorMessage(error))
    } finally {
      setTesting(false)
    }
  }

  const saveProvider = async (): Promise<void> => {
    if (!provider) return
    try {
      const saved = await nexus.ai.saveProviderConfig(
        {
          providerId: provider.providerId,
          endpoint: provider.endpoint,
          model: provider.model,
          timeoutMs: provider.timeoutMs,
          temperature: provider.temperature,
          maxTokens: provider.maxTokens,
          stream: provider.stream
        },
        apiKey.trim() ? apiKey.trim() : null
      )
      setProvider(saved)
      setApiKey('')
      pushToast('AI provider saved.', 'success')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <PageShell title="Settings" subtitle="Everything is stored on this machine.">
      <Section title="Appearance" description="Choose how Nexus looks.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Theme</Label>
            <Select
              value={settings.theme}
              onChange={(event) => set({ theme: event.target.value as ThemeMode })}
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Accent colour</Label>
            <div className="flex h-8 items-center gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  aria-label={accent.label}
                  aria-pressed={settings.accent === accent.id}
                  className={
                    settings.accent === accent.id
                      ? 'h-6 w-6 rounded-full border-2 border-ink'
                      : 'h-6 w-6 rounded-full border-2 border-transparent'
                  }
                  style={{ background: accent.color }}
                  onClick={() => set({ accent: accent.id })}
                />
              ))}
            </div>
          </div>
        </div>
        <Toggle
          checked={settings.reduceMotion}
          onChange={(value) => set({ reduceMotion: value })}
          label="Reduce motion"
          description="Disables the interface animations."
        />
      </Section>

      <Section title="Startup" description="What happens when Nexus is launched.">
        <div>
          <Label>Open</Label>
          <Select
            value={settings.startupBehavior}
            className="max-w-sm"
            onChange={(event) =>
              set({ startupBehavior: event.target.value as AppSettings['startupBehavior'] })
            }
          >
            <option value="new-tab">A new tab page</option>
            <option value="restore-session">The last session</option>
            <option value="continue-where-left">Continue where I left off</option>
          </Select>
        </div>
        <div>
          <Label>Home page</Label>
          <Input
            value={settings.homePage}
            className="max-w-sm"
            placeholder="nexus://start"
            onChange={(event) => set({ homePage: event.target.value })}
          />
        </div>
      </Section>

      <Section
        title="Search"
        description="The engine used for search queries from the address bar."
      >
        <div>
          <Label>Search engine</Label>
          <Select
            value={settings.searchEngineId}
            className="max-w-sm"
            onChange={(event) => set({ searchEngineId: event.target.value })}
          >
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="startpage">Startpage</option>
            <option value="brave">Brave</option>
            <option value="custom">Custom template</option>
          </Select>
        </div>
        {settings.searchEngineId === 'custom' ? (
          <div>
            <Label hint="use %s for the query">Custom template</Label>
            <Input
              value={settings.customSearchTemplate}
              className="max-w-sm"
              placeholder="https://example.com/search?q=%s"
              onChange={(event) => set({ customSearchTemplate: event.target.value })}
            />
          </div>
        ) : null}
      </Section>

      <Section title="Downloads">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label>Download folder</Label>
            <Input
              readOnly
              value={settings.downloadDirectory ?? 'The system default folder'}
              className="max-w-sm"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void nexus.downloads
                .chooseDirectory()
                .then((result) => {
                  if (result.directory) set({ downloadDirectory: result.directory })
                })
                .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Choose…
          </Button>
        </div>
        <Toggle
          checked={settings.askWhereToSave}
          onChange={(value) => set({ askWhereToSave: value })}
          label="Ask where to save each file"
          description="Opens a system dialog before every download."
        />
        <Toggle
          checked={settings.showDownloadNotifications}
          onChange={(value) => set({ showDownloadNotifications: value })}
          label="Show download notifications"
        />
      </Section>

      <Section
        title="Privacy"
        description="Nexus never uploads your browsing data. These options control what is kept locally."
      >
        <Toggle
          checked={settings.recordHistory}
          onChange={(value) => set({ recordHistory: value })}
          label="Record browsing history"
          description="Private windows are never recorded, regardless of this setting."
        />
        <Toggle
          checked={settings.clearHistoryOnExit}
          onChange={(value) => set({ clearHistoryOnExit: value })}
          label="Clear history when the application quits"
        />
        <Toggle
          checked={settings.blockThirdPartyCookies}
          onChange={(value) => set({ blockThirdPartyCookies: value })}
          label="Block third-party cookies"
          description="Requires a restart to take effect on already open tabs."
        />
        <Toggle
          checked={settings.zoomPerSite}
          onChange={(value) => set({ zoomPerSite: value })}
          label="Remember the zoom level per site"
        />
      </Section>

      <Section
        title="AI assistant"
        description="The assistant only ever sees the pages you explicitly attach to a request."
      >
        {provider ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Provider</Label>
                <Select
                  value={provider.providerId}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      providerId: event.target.value as AiProviderConfig['providerId']
                    })
                  }
                >
                  <option value="mock">Mock (offline demo — returns canned text)</option>
                  <option value="openai-compatible">OpenAI compatible endpoint</option>
                </Select>
              </div>
              <div>
                <Label>Model</Label>
                <Input
                  value={provider.model}
                  onChange={(event) => setProvider({ ...provider, model: event.target.value })}
                />
              </div>
            </div>

            {provider.providerId === 'openai-compatible' ? (
              <>
                <div>
                  <Label hint="for example https://api.openai.com/v1">Endpoint</Label>
                  <Input
                    value={provider.endpoint}
                    placeholder="https://api.openai.com/v1"
                    onChange={(event) => setProvider({ ...provider, endpoint: event.target.value })}
                  />
                </div>
                <div>
                  <Label hint="stored in the operating system credential store">
                    API key {provider.hasApiKey ? '(saved)' : ''}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      placeholder={provider.hasApiKey ? '••••••••' : 'Paste your key'}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    <IconButton
                      label={showKey ? 'Hide the API key' : 'Show the API key'}
                      onClick={() => setShowKey((value) => !value)}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </IconButton>
                  </div>
                </div>
              </>
            ) : (
              <ErrorNote>
                The mock provider is an offline demo. It returns canned text and never contacts a
                server — switch to an OpenAI compatible endpoint for real answers.
              </ErrorNote>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label hint="milliseconds">Timeout</Label>
                <Input
                  type="number"
                  value={provider.timeoutMs}
                  onChange={(event) =>
                    setProvider({ ...provider, timeoutMs: Number(event.target.value) || 30000 })
                  }
                />
              </div>
              <div>
                <Label>Temperature</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={provider.temperature ?? ''}
                  placeholder="provider default"
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      temperature: event.target.value === '' ? null : Number(event.target.value)
                    })
                  }
                />
              </div>
              <div>
                <Label>Max tokens</Label>
                <Input
                  type="number"
                  value={provider.maxTokens ?? ''}
                  placeholder="provider default"
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      maxTokens: event.target.value === '' ? null : Number(event.target.value)
                    })
                  }
                />
              </div>
            </div>

            <Toggle
              checked={provider.stream}
              onChange={(value) => setProvider({ ...provider, stream: value })}
              label="Stream the answer"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => void saveProvider()}>
                <Save className="h-3.5 w-3.5" />
                Save provider
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={testing}
                onClick={() => void testProvider()}
              >
                {testing ? 'Testing…' : 'Test the connection'}
              </Button>
              {testResult ? (
                <span className="text-[11.5px] text-ink-muted">{testResult}</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-[12px] text-ink-subtle">Loading the provider configuration…</p>
        )}

        <Toggle
          checked={settings.saveAiConversations}
          onChange={(value) => set({ saveAiConversations: value })}
          label="Keep conversation history"
          description="Conversations are stored in the local database."
        />
        <Toggle
          checked={settings.includePageContextByDefault}
          onChange={(value) => set({ includePageContextByDefault: value })}
          label="Attach the current page by default"
          description="The assistant still only receives the text of the page, never your session."
        />
      </Section>

      <Section
        title="Permissions"
        description="Decisions you made for websites. Blocking a permission can be changed here."
      >
        {permissions.length === 0 ? (
          <p className="text-[12px] text-ink-subtle">No site has asked for a permission yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {permissions.map((record) => (
              <li
                key={`${record.origin}:${record.permission}`}
                className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                  {record.origin}
                </span>
                <span className="shrink-0 text-[11.5px] text-ink-muted">
                  {PERMISSION_LABELS[record.permission] ?? record.permission}
                </span>
                <Badge
                  tone={
                    record.decision === 'allow'
                      ? 'success'
                      : record.decision === 'deny'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {record.decision}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void nexus.permissions
                      .set(record.origin, record.permission, 'ask')
                      .then(loadPermissions)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  Ask again
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void nexus.permissions
              .reset()
              .then(loadPermissions)
              .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset all permission decisions
        </Button>
      </Section>

      <Section title="Data" description="Remove locally stored data or export a backup.">
        <div className="flex flex-wrap gap-2">
          {(['history', 'downloads', 'cache', 'cookies'] as const).map((scope) => (
            <Button
              key={scope}
              size="sm"
              variant="secondary"
              onClick={() => {
                void nexus.settings
                  .clearBrowsingData(scope)
                  .then(() => pushToast(`Cleared the ${scope}.`, 'success'))
                  .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
              }}
            >
              <Trash className="h-3.5 w-3.5" />
              Clear {scope}
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void nexus.settings
                .exportData()
                .then((result) => {
                  void nexus.app
                    .saveTextFile(result.content, result.fileName, [
                      { name: 'Nexus backup', extensions: ['json'] }
                    ])
                    .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                })
                .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
            }}
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            Export my data
          </Button>
        </div>
      </Section>

      <Section title="About">
        <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Application</dt>
            <dd className="text-ink">{info ? `${info.name} ${info.version}` : '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Electron</dt>
            <dd className="text-ink">{info?.electronVersion ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Chromium</dt>
            <dd className="text-ink">{info?.chromeVersion ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Node.js</dt>
            <dd className="text-ink">{info?.nodeVersion ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Data folder</dt>
            <dd className="truncate text-ink" title={info?.userDataPath}>
              {info?.userDataPath ?? '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            This build is not code-signed and has no automatic updater. Installations are produced
            by electron-builder and may trigger a Windows SmartScreen warning.
          </p>
        </div>
      </Section>
    </PageShell>
  )
}
