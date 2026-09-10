/**
 * AiriCog Episodic Memory
 *
 * A character that raises subjects but never remembers them is still a chatbot.
 * This is the policy layer that keeps what happened: what an experience was
 * worth at the time, how firmly it is still held now, and what deserves to
 * surface again.
 *
 * It deliberately does no storage and no similarity search — `memory-pgvector`
 * owns the store and the embedding lookup, `memory-timecrystal` owns the
 * token-level working cache. What neither answers is which experiences are
 * worth keeping at all and how they fade, which is what decides whether a
 * character seems to have a past.
 *
 * The model is the ordinary one from the memory literature: an experience is
 * encoded at a strength set by how much attention and feeling it carried, decays
 * from the last time it was touched, and every recall both resets that clock and
 * lengthens the interval before the next fade — so a memory revisited a few
 * times outlives a vivid one never thought of again.
 */

import type { InitiativeCandidate } from '../initiative/initiative'

/**
 * Something that happened, as the character recorded it.
 */
export interface Episode {
  id: string
  /**
   * The atom this episode concerns, tying it to the AtomSpace so a recalled
   * memory can name its subject. Episodes without one are still held; they
   * simply cannot be offered as something to talk about.
   */
  atomId?: string
  /** Epoch milliseconds at which it happened. */
  at: number
  /** Attention on it at encoding, `0` to `1`. Values outside are clamped. */
  salience: number
  /**
   * Affect at encoding, `-1` to `1`. Only the magnitude is read: delight and
   * upset both make an experience stick, indifference is what fades.
   */
  valence?: number
  /** Epoch milliseconds of each time it has been recalled since. */
  recalledAt?: number[]
}

export interface MemoryConfig {
  /**
   * Age at which an unrehearsed memory falls to ~37% of its encoded strength.
   *
   * Defaults to a week, which puts a memory at ~87% the next day and under the
   * retention floor within a month: the character carries a stream's experience
   * into the next few streams, then lets go of whatever it never returned to.
   * Much shorter and nothing survives the gap between streams, which is the
   * whole point of keeping episodes at all.
   *
   * @default 604800000
   */
  retentionScaleMs: number
  /**
   * How much affect magnitude adds to encoding strength. At the default, a
   * fully charged experience encodes half again as strongly as a flat one.
   *
   * @default 0.5
   */
  emotionalWeight: number
  /**
   * Strength below which a memory is let go.
   *
   * @default 0.05
   */
  retentionFloor: number
}

/**
 * A memory offered up for recall, with the strength that ranked it.
 */
export interface RecalledEpisode {
  episode: Episode
  strength: number
}

export function createDefaultMemoryConfig(): MemoryConfig {
  return {
    retentionScaleMs: 604_800_000,
    emotionalWeight: 0.5,
    retentionFloor: 0.05,
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value))
    return 0

  return Math.min(1, Math.max(0, value))
}

/**
 * The most recent time the memory was touched — its last recall, or encoding
 * if it has never been recalled. Decay is measured from here rather than from
 * encoding, which is what makes recall restorative.
 */
function lastTouchedAt(episode: Episode): number {
  let latest = episode.at

  for (const recalledAt of episode.recalledAt ?? []) {
    if (recalledAt > latest)
      latest = recalledAt
  }

  return latest
}

/**
 * How strongly an experience was laid down, before any decay.
 *
 * Attention sets the floor and feeling multiplies it: something the character
 * cared about is held better than something merely noticed.
 */
export function encodingStrength(
  episode: Episode,
  config: Partial<MemoryConfig> = {},
): number {
  const { emotionalWeight } = { ...createDefaultMemoryConfig(), ...config }
  const salience = clampUnit(episode.salience)
  const charge = Math.min(1, Math.abs(episode.valence ?? 0))

  return clampUnit(salience * (1 + emotionalWeight * charge))
}

/**
 * How firmly the memory is held right now.
 *
 * Decays exponentially from the last touch, over an interval that each recall
 * lengthens — the spacing effect, and the reason a memory returned to a few
 * times outlasts a vivid one left alone.
 */
export function memoryStrength(
  episode: Episode,
  now: number,
  config: Partial<MemoryConfig> = {},
): number {
  const resolved = { ...createDefaultMemoryConfig(), ...config }
  const base = encodingStrength(episode, resolved)

  if (base === 0)
    return 0

  // A clock corrected backwards must not read as the future strengthening a
  // memory, so ages before the last touch count as no elapsed time.
  const age = Math.max(0, now - lastTouchedAt(episode))
  const rehearsals = (episode.recalledAt ?? []).length
  const retention = resolved.retentionScaleMs * (1 + rehearsals)

  if (retention <= 0)
    return 0

  return base * Math.exp(-age / retention)
}

/**
 * Whether the memory is still worth keeping.
 */
export function shouldRetain(
  episode: Episode,
  now: number,
  config: Partial<MemoryConfig> = {},
): boolean {
  const { retentionFloor } = { ...createDefaultMemoryConfig(), ...config }

  return memoryStrength(episode, now, config) >= retentionFloor
}

/**
 * Records that the memory was recalled, returning a new episode.
 *
 * The original is left untouched so a caller can hold a memory across a recall
 * without the act of remembering mutating what it had.
 */
export function rehearse(episode: Episode, at: number): Episode {
  return {
    ...episode,
    recalledAt: [...(episode.recalledAt ?? []), at],
  }
}

/**
 * The memories still held, strongest first.
 *
 * This ranks by how well each is held, not by what it is about — matching a
 * cue to a subject is the store's job. Callers narrow first, then rank here.
 */
export function recall(
  episodes: readonly Episode[],
  now: number,
  config: Partial<MemoryConfig> = {},
): RecalledEpisode[] {
  const resolved = { ...createDefaultMemoryConfig(), ...config }

  return episodes
    .map(episode => ({ episode, strength: memoryStrength(episode, now, resolved) }))
    .filter(recalled => recalled.strength >= resolved.retentionFloor)
    .sort((a, b) => b.strength - a.strength)
}

/**
 * Offers held memories as subjects the character could raise.
 *
 * This is what closes the loop with `initiative`: how well a memory is held
 * becomes the salience of raising it, so a character brings up what it actually
 * still remembers rather than only what is in front of it. Episodes with no
 * atom are skipped — a memory that cannot name its subject cannot be a topic.
 */
export function asInitiativeCandidates(
  episodes: readonly Episode[],
  now: number,
  config: Partial<MemoryConfig> = {},
): InitiativeCandidate[] {
  const candidates: InitiativeCandidate[] = []

  for (const { episode, strength } of recall(episodes, now, config)) {
    if (episode.atomId === undefined)
      continue

    candidates.push({ atomId: episode.atomId, salience: strength })
  }

  return candidates
}
