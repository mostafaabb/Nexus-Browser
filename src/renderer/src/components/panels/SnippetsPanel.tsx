import { useCallback, useEffect, useMemo, useState } from 'react'
import { Code, FolderPlus, Pencil, Plus, Search, Trash } from 'lucide-react'
import type { Snippet, SnippetFolder } from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { Button, IconButton } from '../ui/Button'
import { Input, Label, TextArea } from '../ui/Input'
import { Badge, EmptyState } from '../ui/Feedback'
import { cn } from '../../lib/cn'

export function SnippetsPanel(): React.JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [folders, setFolders] = useState<SnippetFolder[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [query, setQuery] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Snippet | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    code: '',
    language: 'javascript'
  })

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextFolders, nextSnippets] = await Promise.all([
        nexus.dev.listFolders(),
        nexus.dev.listSnippets(query.trim() || undefined, folderId)
      ])
      setFolders(nextFolders)
      setSnippets(nextSnippets)
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast, query, folderId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === folderId) ?? null,
    [folders, folderId]
  )

  const resetDraft = (): void => {
    setDraft({ title: '', description: '', code: '', language: 'javascript' })
    setEditing(null)
    setCreating(false)
  }

  const save = async (): Promise<void> => {
    if (!draft.title.trim() || !draft.code.trim()) {
      pushToast('A snippet needs a title and some code.', 'error')
      return
    }
    try {
      await nexus.dev.saveSnippet({
        id: editing?.id,
        title: draft.title.trim(),
        description: draft.description.trim(),
        code: draft.code,
        language: draft.language,
        folderId: activeFolder?.id ?? null,
        tags: [],
        favorite: editing?.favorite ?? false
      })
      resetDraft()
      await refresh()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={query}
            placeholder="Search snippets"
            className="h-7 pl-7 text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <IconButton
          label="New folder"
          size="sm"
          onClick={() => {
            const name = window.prompt('Folder name')
            if (!name?.trim()) return
            void nexus.dev
              .createFolder(name.trim())
              .then(refresh)
              .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="New snippet"
          size="sm"
          onClick={() => {
            resetDraft()
            setCreating(true)
          }}
        >
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        <button
          type="button"
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] transition-colors',
            folderId === null ? 'bg-accent/20 text-accent' : 'text-ink-muted hover:bg-surface-2'
          )}
          onClick={() => setFolderId(null)}
        >
          All
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors',
              folderId === folder.id
                ? 'bg-accent/20 text-accent'
                : 'text-ink-muted hover:bg-surface-2'
            )}
            onClick={() => setFolderId(folder.id)}
          >
            {folder.name}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Delete the folder ${folder.name}`}
              className="grid h-3.5 w-3.5 place-items-center rounded hover:text-danger"
              onClick={(event) => {
                event.stopPropagation()
                void nexus.dev
                  .deleteFolder(folder.id)
                  .then(refresh)
                  .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.stopPropagation()
                  void nexus.dev
                    .deleteFolder(folder.id)
                    .then(refresh)
                    .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                }
              }}
            >
              <Trash className="h-2.5 w-2.5" />
            </span>
          </button>
        ))}
      </div>

      {creating || editing ? (
        <div className="space-y-1.5 border-b border-line bg-surface-2 p-2">
          <Label>Title</Label>
          <Input
            autoFocus
            value={draft.title}
            className="mb-1"
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Label>Description</Label>
          <Input
            value={draft.description}
            className="mb-1"
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <Label>Language</Label>
          <Input
            value={draft.language}
            className="mb-1"
            onChange={(event) => setDraft({ ...draft, language: event.target.value })}
          />
          <Label>Code</Label>
          <TextArea
            rows={5}
            value={draft.code}
            className="mb-1 font-mono text-[12px]"
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => void save()}>
              Save snippet
            </Button>
            <Button size="sm" variant="ghost" onClick={resetDraft}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="nx-scroll min-h-0 flex-1 p-2">
        {snippets.length === 0 ? (
          <EmptyState
            icon={<Code className="h-7 w-7" />}
            title="No snippets yet"
            description="Store reusable code fragments, HTTP requests and notes — everything stays on this machine."
          />
        ) : (
          <ul className="space-y-1.5">
            {snippets.map((snippet) => (
              <li
                key={snippet.id}
                className="group rounded-md border border-line bg-surface-2 p-2.5 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">{snippet.title}</p>
                    {snippet.description ? (
                      <p className="truncate text-[11px] text-ink-subtle">{snippet.description}</p>
                    ) : null}
                  </div>
                  <Badge tone="neutral">{snippet.language}</Badge>
                  <IconButton
                    label="Edit the snippet"
                    size="sm"
                    onClick={() => {
                      setDraft({
                        title: snippet.title,
                        description: snippet.description,
                        code: snippet.code,
                        language: snippet.language
                      })
                      setEditing(snippet)
                      setCreating(false)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Delete the snippet"
                    size="sm"
                    onClick={() => {
                      void nexus.dev
                        .deleteSnippet(snippet.id)
                        .then(refresh)
                        .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
                    }}
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
                <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-surface px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink-muted">
                  {snippet.code}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
