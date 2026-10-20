/**
 * Aion's perspectives, as measures over one hypergraph.
 *
 * A perspective here changes nothing about the AtomSpace. It is a different
 * weighting of the same atoms, so "seeing the situation another way" is the
 * choice of a measure rather than the construction of a second model. Every
 * lens reads the same three signals — truth strength, confidence, and how
 * connected an atom is — and disagrees only about which combination matters.
 *
 * The six lenses form three opposed pairs. Each pair takes one axis and puts a
 * lens at either end, so no lens stands alone and none is a restatement of
 * another:
 *
 *   learning        <-> threat              uncertainty vs entrenchment
 *   cosmic-comedy   <-> infinite-strategy   outlier vs hub
 *   paradox         <-> transcendence       maximal tension vs no tension
 *
 * The pairing is what stops the set from being decoration. Two lenses on the
 * same axis rank the same AtomSpace in close to opposite orders, which is why
 * reframing changes Aion's answer instead of its wording.
 */

import type { Atom } from '@proj-airi/cognitive-airicog'

export type AionLensName
  = | 'learning'
    | 'threat'
    | 'cosmic-comedy'
    | 'infinite-strategy'
    | 'paradox'
    | 'transcendence'

/**
 * What a lens knows about an atom's surroundings.
 *
 * Neither value can be read from the atom alone, so the caller measures the
 * neighbourhood once and every lens shares the result.
 */
export interface AionLensContext {
  /** How many links the atom takes part in. */
  degree: number
  /** Mean truth strength of the atoms this one is linked to. */
  neighbourhoodStrength: number
}

export interface AionLens {
  name: AionLensName
  /** The lens this one is the opposite of, along its shared axis. */
  opposes: AionLensName
  /** One line on what this perspective treats as important. */
  attendsTo: string
  /** Salience for one atom under this lens, in [0, 1]. */
  weigh: (atom: Atom, context: AionLensContext) => number
}

/**
 * Maps an unbounded count into [0, 1) with diminishing returns, so a hub with
 * fifty links does not simply drown one with five.
 */
function saturate(count: number): number {
  if (count <= 0)
    return 0
  return count / (count + 1)
}

/**
 * Every lens returns a value on the same [0, 1] scale, so the relevance step
 * can combine a lens weight with attention without rescaling either.
 */
export const AION_LENSES: Record<AionLensName, AionLens> = {
  /**
   * Where the space is least sure, a new observation changes it most. This is
   * the only lens that rewards ignorance, which is why it is the one that
   * moves Aion toward the edge of what it knows.
   */
  'learning': {
    name: 'learning',
    opposes: 'threat',
    attendsTo: 'claims the knowledge base is least confident about',
    weigh: atom => 1 - atom.truthValue.confidence,
  },

  /**
   * The opposite reading of the same axis. What constrains a chaotic mind is
   * not danger but settledness: a claim that is strong, confident, and heavily
   * linked cannot be played with, because too much rests on it.
   */
  'threat': {
    name: 'threat',
    opposes: 'learning',
    attendsTo: 'entrenched certainties that constrain what can be said next',
    weigh: (atom, context) =>
      atom.truthValue.strength * atom.truthValue.confidence * saturate(context.degree),
  },

  /**
   * Comedy as deviation. An atom is funny in proportion to how far it sits
   * from the company it keeps, so this lens surfaces the member of a
   * neighbourhood that does not belong to it.
   */
  'cosmic-comedy': {
    name: 'cosmic-comedy',
    opposes: 'infinite-strategy',
    attendsTo: 'atoms that disagree with their own neighbourhood',
    weigh: (atom, context) =>
      Math.abs(atom.truthValue.strength - context.neighbourhoodStrength),
  },

  /**
   * The same axis, read for structure rather than surprise: the atom that the
   * most other atoms depend on is the one worth moving.
   */
  'infinite-strategy': {
    name: 'infinite-strategy',
    opposes: 'cosmic-comedy',
    attendsTo: 'atoms the rest of the graph hangs from',
    weigh: (_atom, context) => saturate(context.degree),
  },

  /**
   * Confident ambivalence. Strength near 0.5 is only interesting when the
   * space is sure of it: an unconfident half-truth is just missing data, while
   * a confident one is a genuine contradiction the graph has committed to.
   * The factor of four puts the peak at exactly 1 when strength is 0.5.
   */
  'paradox': {
    name: 'paradox',
    opposes: 'transcendence',
    attendsTo: 'claims the graph is confidently undecided about',
    weigh: (atom) => {
      const ambivalence = 4 * atom.truthValue.strength * (1 - atom.truthValue.strength)
      return ambivalence * atom.truthValue.confidence
    },
  },

  /**
   * The refusal to rank. Weighting every atom equally leaves the ordering to
   * attention alone, which is the closest this system comes to holding no
   * perspective at all — and it is a real position on the tension axis, not an
   * absence of one.
   */
  'transcendence': {
    name: 'transcendence',
    opposes: 'paradox',
    attendsTo: 'everything, equally',
    weigh: () => 1,
  },
}

export const AION_LENS_NAMES = Object.keys(AION_LENSES) as AionLensName[]

/** The three axes, each as the pair of lenses that read it from either end. */
export const AION_LENS_AXES: ReadonlyArray<readonly [AionLensName, AionLensName]> = [
  ['learning', 'threat'],
  ['cosmic-comedy', 'infinite-strategy'],
  ['paradox', 'transcendence'],
]
