import type { Atom } from '@proj-airi/cognitive-airicog'

import { createAtomSpace } from '@proj-airi/cognitive-airicog'
import { describe, expect, it } from 'vitest'

import { AION_LENS_AXES, AION_LENS_NAMES, AION_LENSES } from './aion-lenses'

/** Builds a real atom, so the lenses are exercised through the same shape production uses. */
function atomWith(strength: number, confidence: number): Atom {
  const atomSpace = createAtomSpace()
  return atomSpace.addNode('ConceptNode', `s${strength}-c${confidence}`, { strength, confidence })
}

const isolated = { degree: 0, neighbourhoodStrength: 0.5 }

describe('aion lens set', () => {
  it('pairs every lens with an opposite that names it back', () => {
    for (const name of AION_LENS_NAMES) {
      const lens = AION_LENSES[name]
      expect(AION_LENSES[lens.opposes].opposes).toBe(name)
    }
  })

  it('covers all six lenses across the three axes', () => {
    const paired = AION_LENS_AXES.flat()

    expect(paired).toHaveLength(6)
    expect(new Set(paired).size).toBe(6)
  })

  it('keeps every lens on the same [0, 1] scale', () => {
    // Relevance multiplies a lens weight by attention without rescaling, so a
    // lens that returned an unbounded value would silently dominate the others.
    const samples = [atomWith(0, 0), atomWith(0.5, 0.5), atomWith(1, 1)]

    for (const name of AION_LENS_NAMES) {
      for (const atom of samples) {
        const weight = AION_LENSES[name].weigh(atom, { degree: 40, neighbourhoodStrength: 0 })
        expect(weight).toBeGreaterThanOrEqual(0)
        expect(weight).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('paradox and transcendence', () => {
  it('peaks paradox on a confident half-truth', () => {
    const contradiction = AION_LENSES.paradox.weigh(atomWith(0.5, 1), isolated)

    expect(contradiction).toBe(1)
  })

  it('reads an unconfident half-truth as missing data rather than paradox', () => {
    const undecided = AION_LENSES.paradox.weigh(atomWith(0.5, 0.1), isolated)
    const contradiction = AION_LENSES.paradox.weigh(atomWith(0.5, 1), isolated)

    expect(undecided).toBeLessThan(contradiction)
  })

  it('gives a settled certainty no paradox at all', () => {
    expect(AION_LENSES.paradox.weigh(atomWith(1, 1), isolated)).toBe(0)
  })

  it('ranks everything alike under transcendence', () => {
    const low = AION_LENSES.transcendence.weigh(atomWith(0.1, 0.2), isolated)
    const high = AION_LENSES.transcendence.weigh(atomWith(0.9, 0.8), { degree: 9, neighbourhoodStrength: 0.1 })

    expect(low).toBe(high)
  })
})

describe('learning and threat', () => {
  it('sends learning toward what the graph is least sure of', () => {
    const unsure = AION_LENSES.learning.weigh(atomWith(0.5, 0.1), isolated)
    const settled = AION_LENSES.learning.weigh(atomWith(0.5, 0.9), isolated)

    expect(unsure).toBeGreaterThan(settled)
  })

  it('sends threat toward entrenched, load-bearing certainty', () => {
    const entrenched = AION_LENSES.threat.weigh(atomWith(1, 1), { degree: 20, neighbourhoodStrength: 0.5 })
    const peripheral = AION_LENSES.threat.weigh(atomWith(1, 1), { degree: 0, neighbourhoodStrength: 0.5 })

    expect(entrenched).toBeGreaterThan(peripheral)
  })

  it('orders the same atom oppositely under the two ends of the axis', () => {
    // This is the property that makes reframing change Aion's answer rather
    // than its wording: the pair must disagree about the same graph.
    const connected = { degree: 10, neighbourhoodStrength: 0.5 }
    const certain = atomWith(0.95, 0.95)
    const doubtful = atomWith(0.95, 0.05)

    expect(AION_LENSES.threat.weigh(certain, connected))
      .toBeGreaterThan(AION_LENSES.threat.weigh(doubtful, connected))
    expect(AION_LENSES.learning.weigh(certain, connected))
      .toBeLessThan(AION_LENSES.learning.weigh(doubtful, connected))
  })
})

describe('cosmic comedy and infinite strategy', () => {
  it('finds comedy in an atom that disagrees with its neighbourhood', () => {
    const outlier = AION_LENSES['cosmic-comedy'].weigh(atomWith(0.9, 0.5), { degree: 3, neighbourhoodStrength: 0.1 })
    const conformist = AION_LENSES['cosmic-comedy'].weigh(atomWith(0.9, 0.5), { degree: 3, neighbourhoodStrength: 0.9 })

    expect(outlier).toBeGreaterThan(conformist)
    expect(conformist).toBe(0)
  })

  it('sends infinite strategy to the hub regardless of what it claims', () => {
    const hub = AION_LENSES['infinite-strategy'].weigh(atomWith(0.1, 0.1), { degree: 20, neighbourhoodStrength: 0.5 })
    const leaf = AION_LENSES['infinite-strategy'].weigh(atomWith(0.9, 0.9), { degree: 1, neighbourhoodStrength: 0.5 })

    expect(hub).toBeGreaterThan(leaf)
  })

  it('grows connectivity with diminishing returns', () => {
    // Saturation stops one very busy atom from drowning out the whole graph.
    const few = AION_LENSES['infinite-strategy'].weigh(atomWith(0.5, 0.5), { degree: 2, neighbourhoodStrength: 0.5 })
    const many = AION_LENSES['infinite-strategy'].weigh(atomWith(0.5, 0.5), { degree: 4, neighbourhoodStrength: 0.5 })
    const lots = AION_LENSES['infinite-strategy'].weigh(atomWith(0.5, 0.5), { degree: 8, neighbourhoodStrength: 0.5 })

    expect(many - few).toBeGreaterThan(lots - many)
  })
})
