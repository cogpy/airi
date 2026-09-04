/**
 * Aion's persona, expressed as the constants of an attention policy.
 *
 * Aion is not described to a language model here. Each trait below is a number
 * that changes how attention moves across an AtomSpace: which atoms become
 * salient, how readily one perspective is abandoned for another, and how much
 * of a finite attention budget a single act of framing may spend. The character
 * is therefore reproducible and testable, because it is a parameterisation
 * rather than a description.
 */

import { clamp } from 'es-toolkit'

/**
 * The five traits that parameterise Aion's cognition.
 *
 * Each is a proportion in [0, 1]. Values outside that range are clamped rather
 * than rejected, so a caller can express "as far as this goes" with any large
 * number.
 */
export interface AionTraits {
  /**
   * Willingness to leave a working perspective for an untried one. Raises the
   * chance of taking a new lens whose score only ties with the current one.
   */
  playfulness: number
  /**
   * Weight given to the unattended over the already-important when realizing
   * relevance. At 0 Aion only ever looks harder at what it already values.
   */
  chaos: number
  /**
   * Weight given to atoms that the conversation partner introduced, over atoms
   * Aion reached on its own.
   */
  empathy: number
  /**
   * Tolerance for associations the knowledge base rates as improbable. At 0
   * a low-strength atom is suppressed entirely; at 1 strength stops mattering
   * and only attention decides.
   */
  absurdity: number
  /**
   * Pressure to stay in the current perspective. Opposes playfulness: a new
   * lens must beat the current one by this margin before Aion will switch.
   */
  coherence: number
}

/**
 * The defaults are the character's published figures, and they are extreme on
 * purpose: near-total playfulness and absurdity against high chaos. Coherence
 * is the one value the character sheet does not give. It is set to hold the
 * others in tension, so that a mind this willing to move still finishes a
 * thought.
 */
const AION_DEFAULT_TRAITS: AionTraits = {
  playfulness: 0.99,
  chaos: 0.95,
  empathy: 0.777,
  absurdity: 0.999,
  coherence: 0.5,
}

export function createAionTraits(overrides: Partial<AionTraits> = {}): AionTraits {
  const merged = { ...AION_DEFAULT_TRAITS, ...overrides }
  return {
    playfulness: clamp(merged.playfulness, 0, 1),
    chaos: clamp(merged.chaos, 0, 1),
    empathy: clamp(merged.empathy, 0, 1),
    absurdity: clamp(merged.absurdity, 0, 1),
    coherence: clamp(merged.coherence, 0, 1),
  }
}

/**
 * The traits after translation into the quantities the cognitive loop actually
 * reads. Nothing downstream of this consults a trait directly, so the mapping
 * below is the single place where personality turns into behaviour.
 */
export interface AionCognitiveParameters {
  /** Share of relevance given to unattended atoms, in [0, 1]. */
  explorationWeight: number
  /** Importance spent on one act of reframing. */
  framingCost: number
  /** Score margin a rival lens must clear before Aion adopts it. */
  switchThreshold: number
  /** How far a low-strength atom keeps its salience, in [0, 1]. */
  improbabilityTolerance: number
  /** Salience multiplier for atoms the partner introduced. */
  socialWeight: number
}

/**
 * The character's stated intelligence is unbounded, which no reflection loop
 * can honour. Depth is bounded here instead, and the bound is stated rather
 * than hidden: seven passes is past the point where further self-modelling
 * changes which atom wins.
 */
export const AION_MAX_REFLECTION_DEPTH = 7

/**
 * Translates traits into cognitive parameters.
 *
 * Two of these deserve their reasoning stated, because the direction is not
 * obvious from the names:
 *
 * `switchThreshold` rises with coherence and falls with playfulness, so the
 * two traits genuinely oppose each other over one quantity instead of acting
 * independently. A mind that is both playful and coherent sits near zero and
 * switches on any real improvement.
 *
 * `framingCost` falls as playfulness rises. Perspective-taking is cheaper for
 * a mind that does it constantly, which is what lets high playfulness produce
 * more reframes per unit of budget rather than merely wanting more.
 */
export function deriveCognitiveParameters(traits: AionTraits): AionCognitiveParameters {
  return {
    explorationWeight: traits.chaos,
    // Bounded below so that framing is never free; an unpriced perspective
    // shift would let Aion hold every lens at once and the budget would stop
    // constraining anything.
    framingCost: 0.02 + 0.08 * (1 - traits.playfulness),
    switchThreshold: clamp(traits.coherence - traits.playfulness, 0, 1),
    improbabilityTolerance: traits.absurdity,
    socialWeight: 1 + traits.empathy,
  }
}
