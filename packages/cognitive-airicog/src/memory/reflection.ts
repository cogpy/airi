/**
 * AiriCog Reflection
 *
 * Episodes record what happened; they never say what it meant. Reflection is
 * the step that turns a run of experiences into a few insights the character
 * keeps, such as "they get nervous before interviews", so that later she can
 * act on what she understood, not only on what she heard.
 *
 * Ported from the reflection protocol of the `character-echo` package in the
 * cogpy/moeru-ai fork. Echo reflected every tenth interaction and stored the
 * answers where nothing read them. Here a reflection is an `Episode` like any
 * other: it is encoded, decays, is recalled, and can be raised in a lull.
 *
 * The module owns three decisions and no IO. The caller asks a model:
 *
 * 1. {@link decideReflection}: whether enough has happened since the last
 *    reflection to be worth a model call.
 * 2. {@link reflectionPrompt} and {@link parseReflection}: the prompt contract
 *    with the model, as plain text in and plain text out.
 * 3. {@link reflectionEpisodes}: how the insights are laid down as memories.
 */

import type { Episode } from './episodic'

import { createDefaultMemoryConfig, encodingStrength } from './episodic'

export interface ReflectionConfig {
  /**
   * Summed encoding strength of new experiences that makes a reflection due.
   * At the default, about five ordinary remarks (salience 0.6) are enough;
   * fewer vivid ones are too.
   *
   * @default 3
   */
  importanceThreshold: number
  /**
   * New experiences that make a reflection due whatever their strength. This
   * is Echo's interval: a long run of small talk is still worth summing up.
   *
   * @default 10
   */
  maxPending: number
  /**
   * New experiences needed before any reflection. One remark has nothing to
   * generalize from.
   *
   * @default 3
   */
  minPending: number
  /**
   * Shortest gap between two reflections, in milliseconds. Each one is a model
   * call, so a busy conversation must not trigger one per message.
   *
   * @default 300000
   */
  minIntervalMs: number
  /**
   * Most experiences quoted in one reflection prompt. The newest are kept.
   *
   * @default 20
   */
  maxSources: number
  /**
   * Most insights kept from one reflection.
   *
   * @default 3
   */
  maxInsights: number
  /**
   * Salience a reflection is encoded with. Higher than an ordinary remark, so
   * an insight outlasts the experiences it was drawn from.
   *
   * @default 0.9
   */
  insightSalience: number
}

export function createDefaultReflectionConfig(): ReflectionConfig {
  return {
    importanceThreshold: 3,
    maxPending: 10,
    minPending: 3,
    minIntervalMs: 300_000,
    maxSources: 20,
    maxInsights: 3,
    insightSalience: 0.9,
  }
}

export interface ReflectionState {
  now: number
  /** Every episode currently held, experiences and reflections alike. */
  episodes: readonly Episode[]
  /** When the last reflection was made, or `undefined` if never. */
  lastReflectionAt?: number
}

/**
 * Whether to reflect now, with the experiences to reflect on.
 *
 * - `refractory`: the last reflection was too recent.
 * - `too-few`: fewer than `minPending` new experiences.
 * - `below-threshold`: not enough new experiences, by count or by strength.
 */
export type ReflectionDecision
  = | { reflect: false, reason: 'refractory' | 'too-few' | 'below-threshold', pending: number, importance: number }
    | { reflect: true, sources: Episode[], pending: number, importance: number }

function isExperience(episode: Episode): boolean {
  return (episode.kind ?? 'experience') === 'experience'
}

/**
 * Decides whether enough has happened to reflect on.
 *
 * Only experiences after the last reflection count, so the same remark never
 * feeds two reflections. The refractory gap is checked first: a burst of vivid
 * experiences cannot buy a second model call inside it.
 */
export function decideReflection(state: ReflectionState, config: Partial<ReflectionConfig> = {}): ReflectionDecision {
  const resolved = { ...createDefaultReflectionConfig(), ...config }
  const since = state.lastReflectionAt
  const pendingEpisodes = state.episodes
    .filter(episode => isExperience(episode) && (since === undefined || episode.at > since))
    .sort((a, b) => a.at - b.at)
  const pending = pendingEpisodes.length
  const memoryConfig = createDefaultMemoryConfig()
  const importance = pendingEpisodes.reduce((sum, episode) => sum + encodingStrength(episode, memoryConfig), 0)

  // A clock that ran backwards reads as no time passed, so it stays refractory.
  if (since !== undefined && state.now - since < resolved.minIntervalMs)
    return { reflect: false, reason: 'refractory', pending, importance }
  if (pending < resolved.minPending)
    return { reflect: false, reason: 'too-few', pending, importance }
  if (importance < resolved.importanceThreshold && pending < resolved.maxPending)
    return { reflect: false, reason: 'below-threshold', pending, importance }

  return { reflect: true, sources: pendingEpisodes.slice(-resolved.maxSources), pending, importance }
}

/**
 * Builds the request that asks a model for insights about recent experiences.
 *
 * `describe` turns an episode into the text the model reads; an episode it
 * returns nothing for is left out. The four questions are the ones from
 * Echo's template that produce something worth remembering; the rest of that
 * template asked about the character's own growth, which no later turn reads.
 */
export function reflectionPrompt(
  sources: readonly Episode[],
  describe: (episode: Episode) => string | undefined,
  options: { characterName?: string, maxInsights?: number } = {},
): string {
  const maxInsights = options.maxInsights ?? createDefaultReflectionConfig().maxInsights
  const who = options.characterName ? `You are ${options.characterName}. ` : ''
  const lines = sources
    .map(describe)
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .map(text => `- ${text.trim().replace(/\s+/g, ' ')}`)

  return [
    `${who}Here is what happened in the conversation recently, oldest first:`,
    ...lines,
    '',
    'Reflect on it. Consider what you learned about the people you talk with, what patterns you noticed, what surprised you, and what you would do differently next time.',
    `Write at most ${maxInsights} insights worth remembering later, one per line, each a short sentence in the first person.`,
    'Write only the insights. If nothing is worth remembering, reply with: none',
  ].join('\n')
}

/** Longest insight kept; a longer line is the model narrating, not concluding. */
const MAX_INSIGHT_LENGTH = 200

/**
 * Reads the insights out of a model's reply.
 *
 * @example
 * parseReflection('1. They get nervous before interviews.\n- I joke too much when they are tired.\n\nnone')
 * // => ['They get nervous before interviews.', 'I joke too much when they are tired.']
 */
export function parseReflection(reply: string, maxInsights: number = createDefaultReflectionConfig().maxInsights): string[] {
  const seen = new Set<string>()
  const insights: string[] = []

  for (const line of reply.split('\n')) {
    const text = line
      .trim()
      // Numbering and bullets the model adds although it was asked not to.
      .replace(/^(?:\d+[.)]|[-*•])\s*/, '')
      .replace(/^["'“]+|["'”]+$/g, '')
      .trim()
    const key = text.toLowerCase()

    if (!text || key === 'none' || key === 'none.' || text.length > MAX_INSIGHT_LENGTH || seen.has(key))
      continue

    seen.add(key)
    insights.push(text)
    if (insights.length >= maxInsights)
      break
  }

  return insights
}

/**
 * Lays insights down as reflection episodes, each linked to its sources.
 *
 * An insight is its own subject, so its text is its `atomId`, the same way a
 * caller with no topic naming stores a remark. That lets initiative raise it
 * in a lull like any other memory.
 */
export function reflectionEpisodes(
  insights: readonly string[],
  sources: readonly Episode[],
  at: number,
  config: Partial<ReflectionConfig> = {},
): Episode[] {
  const { insightSalience } = { ...createDefaultReflectionConfig(), ...config }
  const sourceIds = Object.freeze(sources.map(source => source.id))

  return insights.map((insight, index) => ({
    id: `reflection_${at}_${index}`,
    atomId: insight,
    at,
    salience: insightSalience,
    kind: 'reflection' as const,
    sources: sourceIds,
  }))
}
