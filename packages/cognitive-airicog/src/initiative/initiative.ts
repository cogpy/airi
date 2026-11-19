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
 * The character's own subject, raised unprompted, that nobody has answered yet.
 */
export interface UnansweredInitiative {
  /** Epoch milliseconds at which she raised it. */
  at: number
  /** The subject she raised. Omitted when it was a musing of her own choosing. */
  atomId?: string
  /** Whether she already followed it up once. She follows up at most once. */
  followedUp: boolean
}

/**
 * A draw for the chance mode of {@link decideInitiative}.
 *
 * Supplied by the caller, like the clock, so the decision stays pure: a test
 * passes a fixed `random`, and a runtime passes `Math.random()`.
 */
export interface InitiativeChance {
  /** A uniform draw on `[0, 1)`. */
  random: number
  /** Time since the previous poll, in milliseconds. The chance to speak grows with it. */
  elapsedMs: number
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
  /**
   * Arousal of her current mood, `0` (calm) to `1` (excited). Omit to ignore
   * mood. Arousal sets her tempo: excited, a silence presses on her sooner.
   */
  arousal?: number
  /**
   * When she last mused on a subject of her own choosing. Omit if never. Give
   * `musing: true` too, or musing stays off.
   */
  lastMusingAt?: number
  /** Whether she may muse on a subject of her own choosing when a lull runs long. */
  musing?: boolean
  /**
   * Her last unprompted remark, while nobody has answered it. Enables a follow-up.
   * The caller clears it when someone answers. Her own reply finishing is not an answer.
   */
  unanswered?: UnansweredInitiative
  /**
   * A draw for the chance mode. Omit for the threshold mode, where she speaks
   * as soon as the urge reaches the threshold.
   */
  chance?: InitiativeChance
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
  /**
   * How strongly arousal speeds or slows her sense of silence. Tempo is
   * `2 ^ (arousalGain * (arousal - restingArousal))`. The default doubles her
   * tempo at full arousal from rest and slows it to about 0.74 when fully calm.
   *
   * @default 1 / 0.7
   */
  arousalGain: number
  /**
   * Arousal at which the tempo is 1, so a resting mood leaves timing unchanged.
   * Matches the resting arousal of the affect module.
   *
   * @default 0.3
   */
  restingArousal: number
  /**
   * Lull at which boredom reaches ~63% of its ceiling. Longer than
   * `silenceScaleMs`: she first looks for something said earlier, and only a
   * long lull makes her bring up a subject of her own.
   *
   * @default 180000
   */
  boredomScaleMs: number
  /**
   * Ceiling of the urge to muse, `0` to `1`. Below the threshold, she never
   * muses. Raise it for a character who fills silences with her own thoughts.
   *
   * @default 0.6
   */
  musingWeight: number
  /**
   * Wait after an unanswered remark before a follow-up starts to press.
   *
   * @default 30000
   */
  followUpDelayMs: number
  /**
   * Time after the delay at which the urge to follow up reaches ~63% of its ceiling.
   *
   * @default 30000
   */
  followUpScaleMs: number
  /**
   * Chance mode: mean wait for her to speak while the urge holds exactly at
   * the threshold. A higher urge shortens the wait, and a lower one lengthens it.
   *
   * @default 20000
   */
  meanWaitAtThresholdMs: number
  /**
   * Chance mode: how sharply the urge sets the rate. The rate is
   * `(urge / threshold) ^ hazardExponent / meanWaitAtThresholdMs`.
   *
   * @default 2
   */
  hazardExponent: number
  /**
   * Chance mode: fraction of the threshold below which she never speaks, so a
   * barely started silence cannot fire by luck.
   *
   * @default 0.5
   */
  hazardFloor: number
}

/**
 * Why the character stayed quiet.
 *
 * - `refractory` — it spoke unprompted too recently.
 * - `no-candidates` — nothing was in focus to raise, and no musing or follow-up was possible.
 * - `below-threshold` — something was available, but not pressing enough.
 * - `not-yet` — chance mode only: pressing enough, but this draw did not fire.
 */
export type InitiativeHold = 'refractory' | 'no-candidates' | 'below-threshold' | 'not-yet'

/**
 * The decision, carrying the terms that produced it so a caller can log or
 * display why the character spoke rather than only that it did.
 */
export type InitiativeDecision
  = | { act: false, reason: InitiativeHold, urge: number }
    | {
      act: true
      /** She picks up a subject that came up earlier. */
      kind: 'topic'
      /** The subject to raise. */
      topicAtomId: string
      urge: number
      silencePressure: number
      salience: number
      novelty: number
      /** Her tempo from arousal. `1` without a mood. */
      tempo: number
    }
    | {
      act: true
      /** A long lull bored her, and she brings up a subject of her own choosing. */
      kind: 'musing'
      topicAtomId?: undefined
      urge: number
      boredom: number
      novelty: number
      tempo: number
    }
    | {
      act: true
      /** Nobody answered her last remark, and she follows it up once. */
      kind: 'follow-up'
      /** The subject she raised, when it had one. */
      topicAtomId?: string
      urge: number
      /** How long her remark has gone unanswered. */
      waitedMs: number
      tempo: number
    }

type InitiativeAct = Extract<InitiativeDecision, { act: true }>

export function createDefaultInitiativeConfig(): InitiativeConfig {
  return {
    silenceScaleMs: 45_000,
    refractoryMs: 20_000,
    noveltyRecoveryMs: 1_800_000,
    threshold: 0.25,
    arousalGain: 1 / 0.7,
    restingArousal: 0.3,
    boredomScaleMs: 180_000,
    musingWeight: 0.6,
    followUpDelayMs: 30_000,
    followUpScaleMs: 30_000,
    meanWaitAtThresholdMs: 20_000,
    hazardExponent: 2,
    hazardFloor: 0.5,
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
 * Her tempo from arousal: how fast a silence presses on her.
 *
 * Exponential in arousal, so equal steps of arousal scale time by equal
 * factors, and a resting mood gives exactly 1.
 */
export function initiativeTempo(arousal: number | undefined, config: Partial<InitiativeConfig> = {}): number {
  if (arousal === undefined || !Number.isFinite(arousal))
    return 1
  const resolved: InitiativeConfig = { ...createDefaultInitiativeConfig(), ...config }
  return 2 ** (resolved.arousalGain * (clampUnit(arousal) - resolved.restingArousal))
}

/**
 * The best act available, before the threshold or the chance draw decides.
 *
 * Each kind is a product of terms on `[0, 1]`, like the topic urge:
 * - topic: silence pressure × salience × novelty.
 * - musing: boredom × `musingWeight` × novelty of musing.
 * - follow-up: pressure after the unanswered wait. The remark itself is the
 *   subject, so it needs no salience term.
 */
function bestAct(state: InitiativeState, config: InitiativeConfig, tempo: number): InitiativeAct | undefined {
  const silenceMs = Math.max(0, state.now - state.lastInteractionAt) * tempo
  const silencePressure = saturate(silenceMs, config.silenceScaleMs)
  let best: InitiativeAct | undefined

  const consider = (act: InitiativeAct) => {
    // Strictly greater keeps the first of equally urgent acts, so a caller
    // that hands over an ordered focus keeps that order's intent.
    if (best === undefined || act.urge > best.urge)
      best = act
  }

  for (const candidate of state.candidates) {
    const salience = clampUnit(candidate.salience)
    const novelty = noveltyOf(candidate.atomId, state, config)
    consider({ act: true, kind: 'topic', topicAtomId: candidate.atomId, urge: silencePressure * salience * novelty, silencePressure, salience, novelty, tempo })
  }

  if (state.musing) {
    const boredom = saturate(silenceMs, config.boredomScaleMs)
    const novelty = state.lastMusingAt === undefined ? 1 : saturate(state.now - state.lastMusingAt, config.noveltyRecoveryMs)
    consider({ act: true, kind: 'musing', urge: boredom * clampUnit(config.musingWeight) * novelty, boredom, novelty, tempo })
  }

  const unanswered = state.unanswered
  if (unanswered && !unanswered.followedUp) {
    const waitedMs = Math.max(0, state.now - unanswered.at)
    const urge = saturate((waitedMs - config.followUpDelayMs) * tempo, config.followUpScaleMs)
    consider({ act: true, kind: 'follow-up', ...(unanswered.atomId !== undefined ? { topicAtomId: unanswered.atomId } : {}), urge, waitedMs, tempo })
  }

  return best
}

/**
 * Chance mode: whether this draw fires.
 *
 * Speaking is a Poisson process whose rate grows with the urge: the rate at
 * the threshold gives a mean wait of `meanWaitAtThresholdMs`, and the rate
 * scales with `(urge / threshold) ^ hazardExponent`. Over a poll of `elapsedMs`,
 * the chance to fire is `1 - exp(-rate * elapsedMs)`. She speaks at unplanned
 * moments, yet a pressing urge still makes her speak soon.
 */
function fires(urge: number, chance: InitiativeChance, config: InitiativeConfig): boolean {
  if (config.threshold <= 0)
    return true
  const ratio = urge / config.threshold
  if (ratio < config.hazardFloor)
    return false
  const rate = ratio ** config.hazardExponent / Math.max(1, config.meanWaitAtThresholdMs)
  const probability = 1 - Math.exp(-rate * Math.max(0, chance.elapsedMs))
  return chance.random < probability
}

/**
 * Decides whether to speak unprompted, and on what.
 *
 * Three kinds of act compete, and the most urgent one wins:
 * - `topic` picks up a subject that came up earlier. Its urge is the product
 *   of how long the silence has run, how much attention the subject holds,
 *   and how fresh it is. A product rather than a sum, because each term is a
 *   veto: a subject just discussed, one nothing attends to, or a silence that
 *   has barely started should each on its own keep her quiet.
 * - `musing` brings up a subject of her own choosing after a long lull. Only with `musing: true`.
 * - `follow-up` follows up her own unanswered remark, once.
 *
 * Arousal scales how fast every silence presses on her. Without a `chance`
 * draw, she speaks when the urge reaches the threshold. With one, the urge
 * sets a rate, and the draw decides whether she speaks now.
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

  const best = bestAct(state, resolved, initiativeTempo(state.arousal, resolved))
  if (best === undefined)
    return { act: false, reason: 'no-candidates', urge: 0 }

  if (state.chance) {
    if (best.urge < resolved.threshold * resolved.hazardFloor)
      return { act: false, reason: 'below-threshold', urge: best.urge }
    return fires(best.urge, state.chance, resolved) ? best : { act: false, reason: 'not-yet', urge: best.urge }
  }

  if (best.urge < resolved.threshold)
    return { act: false, reason: 'below-threshold', urge: best.urge }

  return best
}

/**
 * Joins candidates from several sources, such as episodic memory and the
 * attention focus. A subject that appears more than once keeps its highest
 * salience, so one source can raise a subject but never lower it.
 */
export function mergeCandidates(...sources: readonly (readonly InitiativeCandidate[])[]): InitiativeCandidate[] {
  const merged = new Map<string, number>()
  for (const source of sources) {
    for (const { atomId, salience } of source)
      merged.set(atomId, Math.max(merged.get(atomId) ?? -Infinity, salience))
  }
  return [...merged].map(([atomId, salience]) => ({ atomId, salience }))
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
