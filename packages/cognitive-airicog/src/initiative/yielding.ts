/**
 * AiriCog Yielding
 *
 * Turn-taking has two halves. {@link decideInitiative} answers when to take the
 * floor; this answers when to give it up — the character is mid-utterance and
 * the other party has started talking over it.
 *
 * The naive rule, stop the moment any sound arrives, is what makes voice
 * assistants feel twitchy: a laugh, an "mhm", or the tail of the user's own
 * previous sentence all cut the character off mid-word. The rule here is that
 * an interruption has to be *sustained* to count, with one exception — someone
 * who keeps talking is interrupting whatever else is true, so insistence
 * overrides every reason to hold on.
 */

/**
 * What the audio layer observes, sampled at the moment of the decision.
 */
export interface YieldState {
  /** Whether the character is currently producing speech. */
  speaking: boolean
  /**
   * Milliseconds since the character's current utterance began.
   *
   * Ignored when `speaking` is false.
   */
  utteranceElapsedMs: number
  /**
   * Milliseconds the other party has been *continuously* speaking over it.
   *
   * Continuity is the audio layer's to track: a pause that ends the overlap
   * resets this to 0, so a series of short backchannels never accumulates into
   * an interruption.
   */
  overlapMs: number
}

export interface YieldConfig {
  /**
   * Overlap below this reads as backchannel — "mhm", a laugh, a short
   * agreement — rather than a bid for the floor.
   *
   * @default 400
   */
  backchannelMs: number
  /**
   * Grace at the start of an utterance, during which overlap is assumed to be
   * the other party finishing their own turn rather than contesting this one.
   *
   * Without it the character clips its own first syllable whenever it answers
   * promptly.
   *
   * @default 300
   */
  openingGraceMs: number
  /**
   * Overlap at or beyond which the floor is given up regardless of any other
   * consideration. Someone still talking this long after starting is
   * interrupting, not backchannelling.
   *
   * @default 1200
   */
  insistentMs: number
}

/**
 * Why the character kept the floor.
 *
 * - `not-speaking` — it had no floor to give up.
 * - `no-overlap` — nobody is talking over it.
 * - `opening-grace` — it had only just started; the overlap is likely the
 *   other party finishing their own turn.
 * - `backchannel` — the overlap is too brief to read as a bid for the floor.
 */
export type YieldHold = 'not-speaking' | 'no-overlap' | 'opening-grace' | 'backchannel'

/**
 * Why the character gave up the floor.
 *
 * - `interrupted` — the overlap outlasted backchannel length.
 * - `insisted` — the overlap outlasted every reason to hold on.
 */
export type YieldRelease = 'interrupted' | 'insisted'

export type YieldDecision
  = | { yieldFloor: false, reason: YieldHold }
    | { yieldFloor: true, reason: YieldRelease }

export function createDefaultYieldConfig(): YieldConfig {
  return {
    backchannelMs: 400,
    openingGraceMs: 300,
    insistentMs: 1200,
  }
}

/**
 * Decides whether to stop speaking because the other party has started.
 *
 * Pure, like {@link decideInitiative}: the audio layer samples the state and
 * owns the consequence, so the policy can be reasoned about and tested without
 * a microphone.
 *
 * @example
 * decideYield({ speaking: true, utteranceElapsedMs: 2000, overlapMs: 150 })
 * // => { yieldFloor: false, reason: 'backchannel' }  — an "mhm", keep going
 *
 * @example
 * decideYield({ speaking: true, utteranceElapsedMs: 2000, overlapMs: 600 })
 * // => { yieldFloor: true, reason: 'interrupted' }   — they want the floor
 */
export function decideYield(
  state: YieldState,
  config: Partial<YieldConfig> = {},
): YieldDecision {
  const resolved: YieldConfig = { ...createDefaultYieldConfig(), ...config }

  if (!state.speaking)
    return { yieldFloor: false, reason: 'not-speaking' }

  if (state.overlapMs <= 0)
    return { yieldFloor: false, reason: 'no-overlap' }

  // Checked before every hold: someone who has been talking this long is
  // interrupting whether or not the character just started, and whether or not
  // the sound began as a backchannel.
  if (state.overlapMs >= resolved.insistentMs)
    return { yieldFloor: true, reason: 'insisted' }

  if (state.utteranceElapsedMs < resolved.openingGraceMs)
    return { yieldFloor: false, reason: 'opening-grace' }

  if (state.overlapMs < resolved.backchannelMs)
    return { yieldFloor: false, reason: 'backchannel' }

  return { yieldFloor: true, reason: 'interrupted' }
}
