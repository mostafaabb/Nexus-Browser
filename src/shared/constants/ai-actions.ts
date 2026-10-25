/**
 * The AI actions offered by the assistant panel.
 *
 * The definitions live in the shared layer because both the main process
 * (which builds the prompt) and the renderer (which renders the buttons) need
 * the exact same list.
 */

import type { AiActionDefinition } from '../types'

export const AI_ACTIONS: readonly AiActionDefinition[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Summarise the current page in a few bullet points.',
    prompt:
      'Summarise the supplied page content. Return a short title, then 3-6 bullet points with the key information, then one sentence with the overall takeaway.',
    requiresContext: ['page', 'reader']
  },
  {
    id: 'explain',
    label: 'Explain',
    description: 'Explain the selected text in plain language.',
    prompt:
      'Explain the supplied text in plain language for a non-expert. Keep it accurate and mention anything that is ambiguous.',
    requiresContext: ['selection', 'page']
  },
  {
    id: 'key-facts',
    label: 'Key facts',
    description: 'Extract the concrete facts, figures and dates.',
    prompt:
      'Extract the concrete facts from the supplied content: names, numbers, dates and verifiable claims. Present them as a list. Do not infer facts that are not present.',
    requiresContext: ['page', 'tabs', 'comparison']
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Produce structured study notes.',
    prompt:
      'Turn the supplied content into structured notes with headings and short bullet points. Keep the original ordering where possible.',
    requiresContext: ['page', 'reader', 'pasted']
  },
  {
    id: 'study-questions',
    label: 'Study questions',
    description: 'Generate questions to test understanding.',
    prompt:
      'Write 5-8 questions that test understanding of the supplied content. Include the answer for each question after it.',
    requiresContext: ['page', 'reader', 'pasted']
  },
  {
    id: 'explain-code',
    label: 'Explain code',
    description: 'Explain what a code snippet does.',
    prompt:
      'Explain what the supplied code does, step by step. Call out inputs, outputs, side effects and any obvious problems.',
    requiresContext: ['selection', 'pasted']
  },
  {
    id: 'summarize-docs',
    label: 'Summarise docs',
    description: 'Summarise technical documentation.',
    prompt:
      'Summarise the supplied technical documentation: purpose, key concepts, the main API or commands, and anything a newcomer must know before using it.',
    requiresContext: ['page', 'reader', 'pasted']
  },
  {
    id: 'summarize-tabs',
    label: 'Summarise tabs',
    description: 'Summarise the tabs that were selected.',
    prompt:
      'Summarise the supplied pages together. Note what each page covers and how they relate to one another.',
    requiresContext: ['tabs']
  },
  {
    id: 'compare-pages',
    label: 'Compare pages',
    description: 'Compare two selected pages.',
    prompt:
      'Compare the supplied pages. Use a table for the main differences and list the similarities underneath.',
    requiresContext: ['comparison']
  },
  {
    id: 'research-notes',
    label: 'Research notes',
    description: 'Produce structured research notes.',
    prompt:
      'Produce structured research notes from the supplied content: question, sources, findings, open questions and next steps.',
    requiresContext: ['page', 'tabs', 'comparison']
  },
  {
    id: 'simplify',
    label: 'Simplify',
    description: 'Rewrite complex content in simpler language.',
    prompt:
      'Rewrite the supplied content in simpler language while keeping every technical detail accurate. Keep the same structure.',
    requiresContext: ['page', 'selection', 'pasted']
  }
] as const

/** Returns the definition of an AI action. */
export function getAiAction(id: string): AiActionDefinition | undefined {
  return AI_ACTIONS.find((action) => action.id === id)
}
