/**
 * AiriCog Initiative
 *
 * Every other entry point in this package answers "given this input, what
 * follows?". Initiative answers the question nothing else does: with no input
 * at all, is now the moment to speak, and about what?
 *
 * A character that only ever answers is a chatbot. One that raises a subject
 * during a lull reads as present. The gap between those two is a decision made
 * against internal state — how long the silence has run, what the attention
 * economy currently holds in focus, and what was already said recently enough
 * that repeating it would be noticed.
 */

import type { ECAN } from '../attention/ecan'

/**
 * A subject the character could raise, scored by how much attention it holds.
 */
export interface InitiativeCandidate {
  /** The atom this subject stands for. */
  atomId: string
  /** Attention currently on the atom, `0` to `1`. Values outside are clamped. */
  salience: number
}

/**
 * A subject already raised, and when. Used to keep the character off a loop.
 */
export interface RaisedTopic {
  atomId: string
  /** Epoch milliseconds at which it was raised. */
  at: number
}

/**
 * Everything the decision reads. Supplied by the caller rather than sampled
 * here, so the same state always yields the same decision.
 */
export interface InitiativeState {
  /** Epoch milliseconds. */
  now: number
  /** When the other party last said or did something. */
  lastInteractionAt: number
  /** When the character last spoke unprompted. Omit if it never has. */
  lastInitiativeAt?: number
  /** Subjects available to raise, typically from {@link candidatesFromFocus}. */
  candidates: InitiativeCandidate[]
  /** Recently raised subjects, in any order. */
  recentlyRaised?: RaisedTopic[]
}

export interface InitiativeConfig {
  /**
   * Silence at which pressure to speak reaches ~63% of its ceiling.
   *
   * @default 45000
   */
  silenceScaleMs: number
  /**
   * Shortest gap allowed between two unprompted turns. Below this the
   * character stays quiet whatever the urge, so a lull cannot become a monologue.
   *
   * @default 20000
   */
  refractoryMs: number
  /**
   * Age at which a raised subject recovers ~63% of its novelty.
   *
   * Defaults to half an hour: a subject is heavily damped for the first ten
   * minutes or so and freely available again after an hour, which is about how
   * soon returning to something reads as natural rather than as a loop.
   *
   * @default 1800000
   */
  noveltyRecoveryMs: number
  /**
   * Urge at or above which the character speaks. Raise it for a reticent
   * character, lower it for a talkative one.
   *
   * @default 0.25
   */
  threshold: number
}

/**
 * Why the character stayed quiet.
 *
 * - `refractory` — it spoke unprompted too recently.
 * - `no-candidates` — nothing was in focus to raise.
 * - `below-threshold` — something was in focus, but not pressing enough.
 */
export type InitiativeHold = 'refractory' | 'no-candidates' | 'below-threshold'

/**
 * The decision, carrying the terms that produced it so a caller can log or
 * display why the character spoke rather than only that it did.
 */
export type InitiativeDecision
  = | { act: false, reason: InitiativeHold, urge: number }
    | {
      act: true
      /** The subject to raise. */
      topicAtomId: string
      urge: number
      silencePressure: number
      salience: number
      novelty: number
    }

export function createDefaultInitiativeConfig(): InitiativeConfig {
  return {
    silenceScaleMs: 45_000,
    refractoryMs: 20_000,
    noveltyRecoveryMs: 1_800_000,
    threshold: 0.25,
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value))
    return 0

  return Math.min(1, Math.max(0, value))
}

/**
 * Saturating growth on `[0, 1)`: fast at first, never quite reaching 1.
 *
 * Both pressure and novelty recover this way — each is a quantity that should
 * climb steeply once it starts and then flatten, rather than crossing a step.
 */
function saturate(elapsedMs: number, scaleMs: number): number {
  if (elapsedMs <= 0)
    return 0
  if (scaleMs <= 0)
    return 1

  return 1 - Math.exp(-elapsedMs / scaleMs)
}

/**
 * How fresh a subject is: 1 if never raised, climbing back from 0 once it was.
 *
 * Only the most recent mention counts — raising something twice long ago should
 * not hold it back now.
 */
function noveltyOf(atomId: string, state: InitiativeState, config: InitiativeConfig): number {
  let lastRaisedAt: number | undefined

  for (const raised of state.recentlyRaised ?? []) {
    if (raised.atomId !== atomId)
      continue
    if (lastRaisedAt === undefined || raised.at > lastRaisedAt)
      lastRaisedAt = raised.at
  }

  if (lastRaisedAt === undefined)
    return 1

  return saturate(state.now - lastRaisedAt, config.noveltyRecoveryMs)
}

/**
 * Decides whether to speak unprompted, and on what.
 *
 * The urge behind a subject is the product of three quantities on `[0, 1]`:
 * how long the silence has run, how much attention the subject holds, and how
 * fresh it is. A product rather than a sum because each term is a veto — a
 * subject just discussed, one nothing is attending to, or a silence that has
 * barely started should each on its own be enough to keep the character quiet.
 */
export function decideInitiative(
  state: InitiativeState,
  config: Partial<InitiativeConfig> = {},
): InitiativeDecision {
  const resolved: InitiativeConfig = { ...createDefaultInitiativeConfig(), ...config }

  // The refractory gap is absolute: it precedes scoring so that a burst of
  // salience cannot talk the character over its own last unprompted turn.
  if (state.lastInitiativeAt !== undefined
    && state.now - state.lastInitiativeAt < resolved.refractoryMs) {
    return { act: false, reason: 'refractory', urge: 0 }
  }

  if (state.candidates.length === 0)
    return { act: false, reason: 'no-candidates', urge: 0 }

  const silencePressure = saturate(state.now - state.lastInteractionAt, resolved.silenceScaleMs)

  let best: { candidate: InitiativeCandidate, urge: number, novelty: number, salience: number } | undefined

  for (const candidate of state.candidates) {
    const salience = clampUnit(candidate.salience)
    const novelty = noveltyOf(candidate.atomId, state, resolved)
    const urge = silencePressure * salience * novelty

    // Strictly greater keeps the first of equally urgent subjects, so a caller
    // that hands over an ordered focus keeps that order's intent.
    if (best === undefined || urge > best.urge)
      best = { candidate, urge, novelty, salience }
  }

  if (best === undefined || best.urge < resolved.threshold)
    return { act: false, reason: 'below-threshold', urge: best?.urge ?? 0 }

  return {
    act: true,
    topicAtomId: best.candidate.atomId,
    urge: best.urge,
    silencePressure,
    salience: best.salience,
    novelty: best.novelty,
  }
}

/**
 * Reads the attention economy's current focus as initiative candidates.
 *
 * Short-term importance is already the economy's answer to "what matters now",
 * so it is taken as salience directly. Kept separate from
 * {@link decideInitiative} so the decision stays pure and testable without an
 * AtomSpace.
 */
export function candidatesFromFocus(ecan: ECAN): InitiativeCandidate[] {
  return ecan.getAttentionalFocus().map(atom => ({
    atomId: atom.id,
    salience: atom.attentionValue.sti,
  }))
}
