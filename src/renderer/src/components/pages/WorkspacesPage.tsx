import { useCallback, useEffect, useState } from 'react'
import { Check, FolderOpen, LayoutGrid, Pencil, Plus, Save, Trash } from 'lucide-react'
import type { SavedSession, WorkspaceLayout } from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { PageShell } from './PageShell'
import { Button, IconButton } from '../ui/Button'
import { Input, Label, Select } from '../ui/Input'
import { Badge, EmptyState } from '../ui/Feedback'
import { formatDateTime } from '../../lib/format'
import { cn } from '../../lib/cn'

const LAYOUTS: Array<{ id: WorkspaceLayout; label: string }> = [
  { id: 'single', label: 'Single view' },
  { id: 'split-vertical', label: 'Split vertically' },
  { id: 'split-horizontal', label: 'Split horizontally' }
]

const COLORS = ['#8b5cf6', '#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

export function WorkspacesPage(): React.JSX.Element {
  const workspaces = useAppStore((state) => state.workspaces)
  const setWorkspaces = useAppStore((state) => state.setWorkspaces)
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId)
  const activateWorkspace = useAppStore((state) => state.activateWorkspace)
  const pushToast = useAppStore((state) => state.pushToast)

  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    color: COLORS[0]!,
    layout: 'single' as WorkspaceLayout
  })

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextWorkspaces, nextSessions] = await Promise.all([
        nexus.workspaces.list(),
        nexus.workspaces.listSessions()
      ])
      setWorkspaces(nextWorkspaces)
      setSessions(nextSessions)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [setWorkspaces, pushToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async (): Promise<void> => {
    if (!draft.name.trim()) {
      pushToast('The workspace needs a name.', 'error')
      return
    }
    try {
      await nexus.workspaces.create({
        name: draft.name.trim(),
        color: draft.color,
        layout: draft.layout
      })
      setDraft({ name: '', color: COLORS[0]!, layout: 'single' })
      setCreating(false)
      await refresh()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const saveSession = async (workspaceId: string): Promise<void> => {
    const name = window.prompt('Name this session', 'Session')
    if (!name?.trim()) return
    try {
      await nexus.workspaces.saveSession(name.trim(), workspaceId)
      await refresh()
      pushToast('Session saved.', 'success')
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <PageShell
      title="Workspaces"
      subtitle="Group tabs into separate spaces. Switching keeps every tab open."
      actions={
        <Button variant="primary" size="sm" onClick={() => setCreating((value) => !value)}>
          <Plus className="h-3.5 w-3.5" />
          New workspace
        </Button>
      }
    >
      {creating ? (
        <div className="mb-5 rounded-lg border border-line bg-surface p-4">
          <Label>Name</Label>
          <Input
            autoFocus
            value={draft.name}
            className="mb-3 max-w-sm"
            placeholder="Research"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
            }}
          />
          <Label>Colour</Label>
          <div className="mb-3 flex gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use the colour ${color}`}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition-transform',
                  draft.color === color ? 'border-ink scale-110' : 'border-transparent'
                )}
                style={{ background: color }}
                onClick={() => setDraft({ ...draft, color })}
              />
            ))}
          </div>
          <Label>Default layout</Label>
          <Select
            value={draft.layout}
            className="mb-3 max-w-xs"
            onChange={(event) =>
              setDraft({ ...draft, layout: event.target.value as WorkspaceLayout })
            }
          >
            {LAYOUTS.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void create()}>
              Create
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {workspaces.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-7 w-7" />}
          title="No workspaces yet"
          description="Create a workspace to keep separate sets of tabs for different tasks."
        />
      ) : (
        <ul className="mb-8 space-y-2">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-surface px-3.5 py-3 transition-colors',
                workspace.id === activeWorkspaceId
                  ? 'border-accent/50'
                  : 'border-line hover:border-line-strong'
              )}
            >
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ background: workspace.color }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">
                    {workspace.name}
                  </span>
                  {workspace.isDefault ? <Badge tone="accent">Default</Badge> : null}
                  {workspace.id === activeWorkspaceId ? (
                    <Badge tone="success">
                      <Check className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-ink-subtle">
                  {LAYOUTS.find((layout) => layout.id === workspace.layout)?.label ??
                    workspace.layout}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant={workspace.id === activeWorkspaceId ? 'subtle' : 'secondary'}
                  onClick={() => void activateWorkspace(workspace.id)}
                >
                  Switch
                </Button>
                <IconButton
                  label="Rename the workspace"
                  size="sm"
                  onClick={() => {
                    const name = window.prompt('New name', workspace.name)
                    if (!name?.trim()) return
                    void nexus.workspaces
                      .update(workspace.id, { name: name.trim() })
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Save the tabs of this workspace as a session"
                  size="sm"
                  onClick={() => void saveSession(workspace.id)}
                >
                  <Save className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Make this the default workspace"
                  size="sm"
                  onClick={() => {
                    void nexus.workspaces
                      .setDefault(workspace.id)
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Delete the workspace"
                  size="sm"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Delete the workspace "${workspace.name}"? Its tabs are closed and cannot be restored.`
                    )
                    if (!confirmed) return
                    void nexus.workspaces
                      .remove(workspace.id)
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Trash className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          Saved sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="text-[12px] text-ink-subtle">
            Save the tabs of a workspace to reopen them later.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5"
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">{session.name}</p>
                  <p className="text-[11px] text-ink-subtle">{formatDateTime(session.createdAt)}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void nexus.workspaces
                      .restoreSession(session.id)
                      .then(() => pushToast('Session restored.', 'success'))
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  Restore
                </Button>
                <IconButton
                  label="Rename the session"
                  size="sm"
                  onClick={() => {
                    const name = window.prompt('New name', session.name)
                    if (!name?.trim()) return
                    void nexus.workspaces
                      .renameSession(session.id, name.trim())
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Delete the session"
                  size="sm"
                  onClick={() => {
                    void nexus.workspaces
                      .deleteSession(session.id)
                      .then(refresh)
                      .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                  }}
                >
                  <Trash className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
