import { useEffect, useMemo, useRef, useState } from 'react'
import { Brain, CircleAlert, FileText, Plus, Send, Square, Trash, X } from 'lucide-react'
import { AI_ACTIONS } from '@shared/constants/ai-actions'
import { useAiStore, stripContextBlocks } from '../store/ai-store'
import { useAppStore } from '../store/app-store'
import { Button, IconButton } from './ui/Button'
import { TextArea } from './ui/Input'
import { EmptyState, Spinner } from './ui/Feedback'
import { cn } from '../lib/cn'

/**
 * The assistant panel.
 *
 * It is used both as a right-hand drawer and as a full page. The panel only
 * ever receives the text that the user explicitly attaches.
 */
export function AiPanel(): React.JSX.Element {
  const conversations = useAiStore((state) => state.conversations)
  const activeConversationId = useAiStore((state) => state.activeConversationId)
  const messages = useAiStore((state) => state.messages)
  const context = useAiStore((state) => state.context)
  const contextLoading = useAiStore((state) => state.contextLoading)
  const streaming = useAiStore((state) => state.streaming)
  const error = useAiStore((state) => state.error)

  const selectConversation = useAiStore((state) => state.selectConversation)
  const createConversation = useAiStore((state) => state.createConversation)
  const deleteConversation = useAiStore((state) => state.deleteConversation)
  const clearConversation = useAiStore((state) => state.clearConversation)
  const addPageContext = useAiStore((state) => state.addPageContext)
  const addSelectionContext = useAiStore((state) => state.addSelectionContext)
  const removeContextAt = useAiStore((state) => state.removeContextAt)
  const clearContext = useAiStore((state) => state.clearContext)
  const send = useAiStore((state) => state.send)
  const stop = useAiStore((state) => state.stop)

  const activeTabId = useAppStore((state) => state.activeTabId)
  const tabs = useAppStore((state) => state.tabs)
  const pushToast = useAppStore((state) => state.pushToast)
  const settings = useAppStore((state) => state.settings)

  const [prompt, setPrompt] = useState('')
  const [showActions, setShowActions] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [messages])

  const isMockProvider = settings?.aiDefaultProvider === 'mock'

  const submit = async (actionId: string | null = null): Promise<void> => {
    const text = prompt.trim()
    if (!text && !actionId) return
    setPrompt('')
    await send(text, actionId)
  }

  const attachPage = async (): Promise<void> => {
    if (!activeTabId) {
      pushToast('Open a page first.', 'info')
      return
    }
    await addPageContext([activeTabId])
  }

  const attachSelection = async (): Promise<void> => {
    if (!activeTabId) {
      pushToast('Open a page first.', 'info')
      return
    }
    await addSelectionContext(activeTabId)
  }

  const conversationLabel = useMemo(() => {
    const conversation = conversations.find((item) => item.id === activeConversationId)
    return conversation?.title ?? 'New conversation'
  }, [conversations, activeConversationId])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2.5 py-2">
        <Brain className="h-4 w-4 shrink-0 text-accent" />
        <select
          aria-label="Conversation"
          value={activeConversationId ?? ''}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          onChange={(event) => void selectConversation(event.target.value || null)}
        >
          {activeConversationId === null ? <option value="">New conversation</option> : null}
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
        <IconButton
          label="Start a new conversation"
          size="sm"
          onClick={() => void createConversation()}
        >
          <Plus className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Clear the conversation"
          size="sm"
          disabled={!activeConversationId}
          onClick={() => {
            if (activeConversationId) void clearConversation(activeConversationId)
          }}
        >
          <Trash className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label="Delete the conversation"
          size="sm"
          disabled={!activeConversationId}
          onClick={() => {
            if (activeConversationId) void deleteConversation(activeConversationId)
          }}
        >
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </header>

      {isMockProvider ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-ink-muted">
            The <strong>mock provider</strong> is active — it returns canned offline text and never
            contacts a server. Configure a real provider in Settings → AI.
          </p>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!activeTabId || contextLoading}
          onClick={() => void attachPage()}
        >
          <FileText className="h-3.5 w-3.5" />
          Attach page
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!activeTabId || contextLoading}
          onClick={() => void attachSelection()}
        >
          Attach selection
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowActions((value) => !value)}>
          Actions
        </Button>
        {contextLoading ? <Spinner /> : null}
      </div>

      {showActions ? (
        <div className="nx-animate-in grid shrink-0 gap-1 border-b border-line bg-surface-2 p-2">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.description}
              className="rounded-md px-2 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3"
              onClick={() => {
                setShowActions(false)
                void submit(action.id)
              }}
            >
              {action.label}
              <span className="ml-2 text-[10.5px] text-ink-subtle">{action.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {context.length > 0 ? (
        <div className="nx-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-2.5 py-2">
          {context.map((item, index) => (
            <span
              key={`${item.kind}-${index}`}
              className="flex max-w-[220px] shrink-0 items-center gap-1 rounded-full bg-accent/12 px-2 py-1 text-[11px] text-accent"
            >
              <span className="truncate">{item.label}</span>
              <span className="text-accent/60">{item.characters} chars</span>
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-accent/20"
                onClick={() => removeContextAt(index)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <Button size="sm" variant="ghost" onClick={clearContext}>
            Clear
          </Button>
        </div>
      ) : null}

      <div ref={listRef} className="nx-scroll min-h-0 flex-1 space-y-3 p-3">
        {messages.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-7 w-7" />}
            title="Ask about the page you are reading"
            description="Attach a page or a selection and the assistant will work only with that text. It cannot browse, run code or change settings."
          />
        ) : (
          messages.map((message) => (
            <article key={message.id}>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap',
                  message.role === 'user' ? 'bg-accent/12 text-ink' : 'bg-surface-2 text-ink-muted'
                )}
              >
                {message.role === 'user'
                  ? stripContextBlocks(message.content) || message.content
                  : message.content || (message.status === 'streaming' ? '…' : '')}
                {message.status === 'error' ? (
                  <p className="mt-1 text-danger">{message.error}</p>
                ) : null}
                {message.status === 'cancelled' ? (
                  <p className="mt-1 text-[11px] text-ink-subtle">Cancelled.</p>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      {error ? (
        <p className="shrink-0 border-t border-line px-3 py-2 text-[11.5px] text-danger">{error}</p>
      ) : null}

      <footer className="shrink-0 border-t border-line p-2.5">
        <TextArea
          rows={3}
          value={prompt}
          placeholder={
            activeTab ? `Ask about ${activeTab.title || 'this page'}…` : 'Ask the assistant…'
          }
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[10.5px] text-ink-subtle">
            {conversationLabel} · Ctrl+Enter to send
          </span>
          <span className="flex-1" />
          {streaming ? (
            <Button size="sm" variant="secondary" onClick={() => void stop()}>
              <Square className="h-3 w-3" />
              Stop
            </Button>
          ) : null}
          <Button size="sm" variant="primary" disabled={streaming} onClick={() => void submit()}>
            {streaming ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
            Send
          </Button>
        </div>
      </footer>
    </div>
  )
}
