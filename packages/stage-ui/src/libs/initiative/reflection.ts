import type { Episode } from '@proj-airi/cognitive-airicog/memory'
import type { Conversation } from '@proj-airi/core-agent'

import type { ContextMessage } from '../../types/chat'

import { recall } from '@proj-airi/cognitive-airicog/memory'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

/** Source id of the reflection context, so the context store replaces its own last copy. */
const REFLECTION_CONTEXT_SOURCE_ID = 'reflection'

/**
 * Most insights put in front of the model on each reply. Older or fainter
 * ones stay in memory and can still be raised in a lull.
 */
const MAX_CONTEXT_INSIGHTS = 5

/**
 * Wraps a reflection prompt from `@proj-airi/cognitive-airicog/memory` as a
 * one-shot request. The prompt is the whole contract, so it goes in as the
 * only user turn.
 */
export function reflectionConversation(prompt: string): Conversation {
  return {
    turns: [{ type: 'user', id: 'reflection-request', content: [{ type: 'text', text: prompt }] }],
  }
}

/**
 * The reflections she still holds at `now`, strongest first, as text.
 *
 * @example
 * heldInsights([{ id: 'r1', atomId: 'They like cats.', at: now, salience: 0.9, kind: 'reflection' }], now)
 * // => ['They like cats.']
 */
export function heldInsights(episodes: readonly Episode[], now: number, limit = MAX_CONTEXT_INSIGHTS): string[] {
  const reflections = episodes.filter(episode => episode.kind === 'reflection')
  return recall(reflections, now)
    .flatMap(({ episode }) => episode.atomId === undefined ? [] : [episode.atomId])
    .slice(0, limit)
}

/**
 * Puts what she has come to understand into the chat context, so every reply
 * can draw on it. It replaces the previous copy, so the context holds one
 * current list, not a history of lists.
 */
export function insightsContextMessage(insights: readonly string[]): ContextMessage {
  return {
    id: nanoid(),
    contextId: REFLECTION_CONTEXT_SOURCE_ID,
    lane: 'memory',
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: { source: { id: REFLECTION_CONTEXT_SOURCE_ID } },
    text: ['What you have come to understand from this conversation so far:', ...insights.map(insight => `- ${insight}`)].join('\n'),
    createdAt: Date.now(),
  }
}
