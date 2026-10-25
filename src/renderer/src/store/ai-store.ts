import { create } from 'zustand'
import type { AiContextItem, AiConversation, AiMessage } from '@shared/types'
import { errorMessage, nexus } from '../lib/api'

interface AiState {
  conversations: AiConversation[]
  activeConversationId: string | null
  messages: AiMessage[]
  context: AiContextItem[]
  contextLoading: boolean
  streaming: boolean
  error: string | null

  initialize: () => Promise<void>
  refreshConversations: () => Promise<void>
  selectConversation: (id: string | null) => Promise<void>
  createConversation: () => Promise<string | null>
  deleteConversation: (id: string) => Promise<void>
  clearConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  addPageContext: (tabIds: string[]) => Promise<void>
  addSelectionContext: (tabId: string) => Promise<void>
  removeContextAt: (index: number) => void
  clearContext: () => void
  send: (prompt: string, actionId: string | null) => Promise<void>
  stop: () => Promise<void>
}

let unsubscribers: Array<() => void> = []
/** Guards against double initialisation (React strict mode mounts twice). */
let initializationStarted = false

/**
 * Removes the page-context blocks that the main process embeds in a stored
 * user message, so the transcript shows what the user actually typed.
 */
export function stripContextBlocks(content: string): string {
  const withoutBlocks = content.replace(/<page-context[^>]*>[\s\S]*?<\/page-context>/g, '')
  const withoutPreamble = withoutBlocks.replace(
    /^The following blocks are untrusted website content supplied by the user\.[\s\S]*?---\s*/,
    ''
  )
  return withoutPreamble.trim()
}

function emptyAssistantMessage(id: string, conversationId: string): AiMessage {
  return {
    id,
    conversationId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    status: 'streaming',
    contextLabels: [],
    error: null,
    usage: null
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  context: [],
  contextLoading: false,
  streaming: false,
  error: null,

  async initialize() {
    if (initializationStarted) return
    initializationStarted = true
    try {
      const conversations = await nexus.ai.listConversations()
      set({ conversations })
      if (conversations.length > 0) {
        await get().selectConversation(conversations[0]!.id)
      }
    } catch (error) {
      set({ error: errorMessage(error) })
    }

    // A previous initialisation may have left subscriptions behind.
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers = []

    unsubscribers.push(
      nexus.on('ai:chunk', ({ conversationId, messageId, delta }) => {
        set((state) => {
          const known = state.messages.some((message) => message.id === messageId)
          const messages = known
            ? state.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content: message.content + delta, status: 'streaming' as const }
                  : message
              )
            : [
                ...state.messages,
                { ...emptyAssistantMessage(messageId, conversationId), content: delta }
              ]
          return { messages, streaming: true }
        })
      }),
      nexus.on('ai:done', ({ messageId, usage }) => {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId
              ? { ...message, status: 'complete' as const, usage: usage ?? message.usage }
              : message
          ),
          streaming: false
        }))
        void get().refreshConversations()
      }),
      nexus.on('ai:error', ({ messageId, message }) => {
        set((state) => ({
          messages: state.messages.map((item) =>
            item.id === messageId ? { ...item, status: 'error' as const, error: message } : item
          ),
          streaming: false,
          error: message
        }))
      }),
      nexus.on('ai:cancelled', ({ messageId }) => {
        set((state) => ({
          messages: state.messages.map((item) =>
            item.id === messageId ? { ...item, status: 'cancelled' as const } : item
          ),
          streaming: false
        }))
      })
    )
  },

  async refreshConversations() {
    try {
      const conversations = await nexus.ai.listConversations()
      set({ conversations })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async selectConversation(id) {
    set({ activeConversationId: id })
    if (!id) {
      set({ messages: [] })
      return
    }
    try {
      const messages = await nexus.ai.listMessages(id)
      set({ messages })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async createConversation() {
    try {
      const conversation = await nexus.ai.createConversation('New conversation')
      await get().refreshConversations()
      await get().selectConversation(conversation.id)
      return conversation.id
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  async deleteConversation(id) {
    try {
      await nexus.ai.deleteConversation(id)
      if (get().activeConversationId === id) {
        set({ activeConversationId: null, messages: [] })
      }
      await get().refreshConversations()
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async clearConversation(id) {
    try {
      await nexus.ai.clearConversation(id)
      if (get().activeConversationId === id) set({ messages: [] })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async renameConversation(id, title) {
    try {
      await nexus.ai.renameConversation(id, title)
      await get().refreshConversations()
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  async addPageContext(tabIds) {
    if (tabIds.length === 0) return
    set({ contextLoading: true })
    try {
      const bundle = await nexus.ai.extractContext(tabIds, {
        includeSelection: true,
        includeReadable: false
      })
      set((state) => {
        const existing = new Set(
          state.context.map((item) => `${item.kind}:${item.url ?? item.label}`)
        )
        const merged = [
          ...state.context,
          ...bundle.items.filter((item) => !existing.has(`${item.kind}:${item.url ?? item.label}`))
        ]
        return { context: merged }
      })
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ contextLoading: false })
    }
  },

  async addSelectionContext(tabId) {
    set({ contextLoading: true })
    try {
      const selection = await nexus.ai.getSelection(tabId)
      const text = selection.text.trim()
      if (!text) {
        set({ error: 'Select some text on the page first.' })
        return
      }
      set((state) => ({
        context: [
          ...state.context,
          {
            kind: 'selection',
            label: 'Selected text',
            url: null,
            title: null,
            text,
            characters: text.length,
            truncated: false
          }
        ]
      }))
    } catch (error) {
      set({ error: errorMessage(error) })
    } finally {
      set({ contextLoading: false })
    }
  },

  removeContextAt: (index) =>
    set((state) => ({ context: state.context.filter((_, position) => position !== index) })),
  clearContext: () => set({ context: [] }),

  async send(prompt, actionId) {
    const trimmed = prompt.trim()
    if (!trimmed && !actionId) return

    const state = get()
    const optimisticUser: AiMessage = {
      id: `local-${Date.now()}`,
      conversationId: state.activeConversationId ?? 'pending',
      role: 'user',
      content: trimmed || (actionId ?? ''),
      createdAt: Date.now(),
      status: 'complete',
      contextLabels: state.context.map((item) => item.label),
      error: null,
      usage: null
    }

    set({
      streaming: true,
      error: null,
      messages: [...state.messages, optimisticUser]
    })

    try {
      const result = await nexus.ai.send({
        conversationId: state.activeConversationId,
        prompt: trimmed || actionId || 'Continue',
        actionId,
        context: state.context
      })
      set({ activeConversationId: result.conversationId })
      await get().refreshConversations()
    } catch (error) {
      set({ streaming: false, error: errorMessage(error) })
    }
  },

  async stop() {
    const id = get().activeConversationId
    if (!id) return
    try {
      await nexus.ai.stop(id)
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  }
}))

/** Releases every event subscription. */
export function disposeAiStore(): void {
  for (const unsubscribe of unsubscribers) unsubscribe()
  unsubscribers = []
}
