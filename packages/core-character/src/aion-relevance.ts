/**
 * Relevance realization for Aion.
 *
 * Two forces decide what matters. Exploitation looks harder at atoms that are
 * already important; exploration looks at atoms that have been ignored. Neither
 * is correct on its own — a mind that only exploits never learns anything, and
 * one that only explores never finishes a thought — so the chaos trait sets the
 * balance between them and the active lens then re-weights the result.
 *
 * The second thing this module computes is how well a lens suits the space it
 * is pointed at. That is deliberately not "how much total relevance does this
 * lens report", because a lens that calls everything equally important would
 * win that contest while saying nothing. Fit is measured as spread instead: a
 * perspective is useful here when it separates these atoms.
 */

import type { Atom, AtomSpace, Link } from '@proj-airi/cognitive-airicog'

import type { AionLens, AionLensContext } from './aion-lenses'
import type { AionCognitiveParameters } from './aion-persona'

export interface RealizeRelevanceOptions {
  atomSpace: AtomSpace
  lens: AionLens
  parameters: AionCognitiveParameters
  /**
   * Atoms the conversation partner introduced. These are weighted up by the
   * empathy-derived social weight, which is the only place another party's
   * contribution outranks Aion's own associations.
   */
  partnerAtomIds?: ReadonlySet<string>
}

export interface RelevanceResult {
  /** Relevance per atom id. Larger is more relevant; the scale is arbitrary. */
  scores: Map<string, number>
  /** Atoms ordered by descending relevance. */
  ranked: Atom[]
  /**
   * How sharply this lens separates these atoms, as the population standard
   * deviation of the scores. Exactly 0 when the lens ranks everything alike,
   * which is the signal that this perspective offers no guidance here.
   */
  fit: number
}

/**
 * Measures each atom's surroundings in one pass.
 *
 * Degree counts the links an atom takes part in. Neighbourhood strength is the
 * mean truth strength of the atoms it shares those links with. An atom with no
 * neighbours takes its own strength, so that isolation reads as agreement
 * rather than as surprise — otherwise every disconnected atom would look like
 * the funniest thing in the graph.
 */
export function measureNeighbourhoods(atomSpace: AtomSpace): Map<string, AionLensContext> {
  const atoms = atomSpace.getAllAtoms()
  const byId = new Map(atoms.map(atom => [atom.id, atom]))
  const neighbours = new Map<string, Set<string>>()
  const degrees = new Map<string, number>()

  for (const atom of atoms) {
    if (atom.kind !== 'link')
      continue

    const members = (atom as Link).outgoing
    for (const memberId of members) {
      degrees.set(memberId, (degrees.get(memberId) ?? 0) + 1)

      let memberNeighbours = neighbours.get(memberId)
      if (!memberNeighbours) {
        memberNeighbours = new Set()
        neighbours.set(memberId, memberNeighbours)
      }
      for (const otherId of members) {
        if (otherId !== memberId)
          memberNeighbours.add(otherId)
      }
    }
  }

  const contexts = new Map<string, AionLensContext>()
  for (const atom of atoms) {
    const linked = neighbours.get(atom.id)
    let neighbourhoodStrength = atom.truthValue.strength

    if (linked && linked.size > 0) {
      let total = 0
      let counted = 0
      for (const neighbourId of linked) {
        const neighbour = byId.get(neighbourId)
        if (!neighbour)
          continue
        total += neighbour.truthValue.strength
        counted++
      }
      if (counted > 0)
        neighbourhoodStrength = total / counted
    }

    contexts.set(atom.id, {
      degree: degrees.get(atom.id) ?? 0,
      neighbourhoodStrength,
    })
  }

  return contexts
}

export function realizeRelevance(options: RealizeRelevanceOptions): RelevanceResult {
  const { atomSpace, lens, parameters, partnerAtomIds } = options
  const atoms = atomSpace.getAllAtoms()
  const contexts = measureNeighbourhoods(atomSpace)
  const scores = new Map<string, number>()

  for (const atom of atoms) {
    const context = contexts.get(atom.id) ?? { degree: 0, neighbourhoodStrength: atom.truthValue.strength }
    const sti = atom.attentionValue.sti

    // Opponent processing: chaos decides how much of the budget of interest
    // goes to what has been ignored rather than to what already stands out.
    const attention
      = (1 - parameters.explorationWeight) * sti
        + parameters.explorationWeight * (1 - sti)

    // Absurdity decides how much an improbable claim keeps its salience. At
    // full tolerance strength drops out of the product entirely, which is what
    // lets Aion take an unlikely association as seriously as a settled one.
    const plausibility
      = atom.truthValue.strength
        + parameters.improbabilityTolerance * (1 - atom.truthValue.strength)

    const social = partnerAtomIds?.has(atom.id) ? parameters.socialWeight : 1

    scores.set(atom.id, lens.weigh(atom, context) * attention * plausibility * social)
  }

  const ranked = [...atoms].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))

  return { scores, ranked, fit: spread([...scores.values()]) }
}

/**
 * Population standard deviation. Used as the discrimination measure, so a
 * uniform lens scores exactly 0 rather than scoring highly for being generous.
 */
function spread(values: number[]): number {
  if (values.length === 0)
    return 0

  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length

  return Math.sqrt(variance)
}
