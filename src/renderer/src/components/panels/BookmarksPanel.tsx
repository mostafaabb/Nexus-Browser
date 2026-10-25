import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderPlus, Globe, Pencil, Plus, Search, Trash } from 'lucide-react'
import type { Bookmark } from '@shared/types'
import { nexus, errorMessage } from '../../lib/api'
import { useAppStore } from '../../store/app-store'
import { Button, IconButton } from '../ui/Button'
import { Input, Label } from '../ui/Input'
import { EmptyState } from '../ui/Feedback'
import { Menu, type MenuItem } from '../ui/Menu'
import { cn } from '../../lib/cn'

interface TreeNode extends Bookmark {
  children: TreeNode[]
}

function buildTree(items: Bookmark[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>()
  for (const item of items) nodes.set(item.id, { ...item, children: [] })
  const roots: TreeNode[] = []
  for (const item of items) {
    const node = nodes.get(item.id)
    if (!node) continue
    const parent = item.parentId ? nodes.get(item.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (list: TreeNode[]): void => {
    list.sort((a, b) => a.position - b.position)
    for (const node of list) sort(node.children)
  }
  sort(roots)
  return roots
}

export function BookmarksPanel(): React.JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const navigate = useAppStore((state) => state.navigate)
  const [items, setItems] = useState<Bookmark[]>([])
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [context, setContext] = useState<{ x: number; y: number; node: TreeNode } | null>(null)
  const [adding, setAdding] = useState<{
    mode: 'bookmark' | 'folder'
    parentId: string | null
  } | null>(null)
  const [draft, setDraft] = useState('')
  const [draftUrl, setDraftUrl] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setItems(await nexus.bookmarks.list())
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }, [pushToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(trimmed) ||
        (item.url ?? '').toLowerCase().includes(trimmed)
    )
  }, [items, query])

  const tree = useMemo(() => buildTree(filtered), [filtered])

  const toggle = (id: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submitDraft = async (): Promise<void> => {
    if (!adding) return
    const title = draft.trim()
    if (!title) return
    try {
      if (adding.mode === 'folder') {
        await nexus.bookmarks.createFolder(title, adding.parentId)
      } else {
        const url = draftUrl.trim() || 'nexus://start'
        await nexus.bookmarks.create(title, url, adding.parentId)
      }
      setAdding(null)
      setDraft('')
      setDraftUrl('')
      await refresh()
    } catch (error) {
      pushToast(errorMessage(error), 'error')
    }
  }

  const contextItems = (node: TreeNode): MenuItem[] => [
    {
      id: 'open',
      label: 'Open in a new tab',
      icon: <Globe className="h-3.5 w-3.5" />,
      disabled: !node.url,
      onSelect: () => {
        if (node.url) void navigate(node.url)
      }
    },
    {
      id: 'bookmark',
      label: 'Add bookmark here',
      icon: <Plus className="h-3.5 w-3.5" />,
      onSelect: () => {
        setAdding({ mode: 'bookmark', parentId: node.id })
        setDraft('')
        setDraftUrl('')
      }
    },
    {
      id: 'folder',
      label: 'Add folder here',
      icon: <FolderPlus className="h-3.5 w-3.5" />,
      onSelect: () => {
        setAdding({ mode: 'folder', parentId: node.id })
        setDraft('')
        setDraftUrl('')
      }
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil className="h-3.5 w-3.5" />,
      onSelect: () => {
        const next = window.prompt('New name', node.title)
        if (next && next.trim()) {
          void nexus.bookmarks
            .update(node.id, { title: next.trim() })
            .then(refresh)
            .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
        }
      }
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash className="h-3.5 w-3.5" />,
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        void nexus.bookmarks
          .remove(node.id)
          .then(refresh)
          .catch((error: unknown) => pushToast(errorMessage(error), 'error'))
      }
    }
  ]

  const renderNode = (node: TreeNode, depth: number): React.JSX.Element => {
    const isFolder = node.url === null
    const isCollapsed = collapsed.has(node.id)
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface-2"
          style={{ paddingLeft: 6 + depth * 12 }}
          onContextMenu={(event) => {
            event.preventDefault()
            setContext({ x: event.clientX, y: event.clientY, node })
          }}
        >
          {isFolder ? (
            <button
              type="button"
              aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
              className="grid h-4 w-4 shrink-0 place-items-center text-ink-subtle"
              onClick={() => toggle(node.id)}
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', !isCollapsed && 'rotate-90')}
              />
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          {isFolder ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-[12.5px] text-ink"
            onClick={() => {
              if (isFolder) toggle(node.id)
              else if (node.url) void navigate(node.url)
            }}
            title={node.url ?? node.title}
          >
            {node.title}
          </button>
        </div>
        {!isCollapsed ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={query}
            placeholder="Search bookmarks"
            className="h-7 pl-7 text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <IconButton
          label="Add bookmark"
          size="sm"
          onClick={() => {
            setAdding({ mode: 'bookmark', parentId: null })
            setDraft('')
            setDraftUrl('')
          }}
        >
          <Plus className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Add folder"
          size="sm"
          onClick={() => {
            setAdding({ mode: 'folder', parentId: null })
            setDraft('')
            setDraftUrl('')
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </IconButton>
      </div>

      {adding ? (
        <div className="border-b border-line bg-surface-2 p-2">
          <Label>{adding.mode === 'folder' ? 'Folder name' : 'Bookmark title'}</Label>
          <Input
            autoFocus
            value={draft}
            placeholder={adding.mode === 'folder' ? 'Research' : 'Example'}
            className="mb-1.5"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitDraft()
              if (event.key === 'Escape') setAdding(null)
            }}
          />
          {adding.mode === 'bookmark' ? (
            <>
              <Label>Address</Label>
              <Input
                value={draftUrl}
                placeholder="https://example.com"
                className="mb-1.5"
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitDraft()
                  if (event.key === 'Escape') setAdding(null)
                }}
              />
            </>
          ) : null}
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => void submitDraft()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="nx-scroll min-h-0 flex-1 p-1.5">
        {tree.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-7 w-7" />}
            title={query ? 'No matching bookmarks' : 'No bookmarks yet'}
            description={
              query
                ? 'Try a different search term.'
                : 'Bookmarks you create are stored locally in the Nexus database.'
            }
          />
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      {context ? (
        <Menu
          items={contextItems(context.node)}
          x={context.x}
          y={context.y}
          onClose={() => setContext(null)}
        />
      ) : null}
    </div>
  )
}
