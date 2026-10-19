import type { AtomSpace } from '@proj-airi/cognitive-airicog'

import { createAtomSpace } from '@proj-airi/cognitive-airicog'
import { beforeEach, describe, expect, it } from 'vitest'

import { AION_LENSES } from './aion-lenses'
import { createAionTraits, deriveCognitiveParameters } from './aion-persona'
import { measureNeighbourhoods, realizeRelevance } from './aion-relevance'

function parametersFor(traits: Partial<Parameters<typeof createAionTraits>[0]>) {
  return deriveCognitiveParameters(createAionTraits(traits))
}

describe('neighbourhood measurement', () => {
  let atomSpace: AtomSpace

  beforeEach(() => {
    atomSpace = createAtomSpace({ name: 'neighbourhood' })
  })

  it('counts the links an atom takes part in', () => {
    const hub = atomSpace.addNode('ConceptNode', 'hub')
    const first = atomSpace.addNode('ConceptNode', 'first')
    const second = atomSpace.addNode('ConceptNode', 'second')
    atomSpace.addLink('AssociativeLink', [hub.id, first.id])
    atomSpace.addLink('AssociativeLink', [hub.id, second.id])

    const contexts = measureNeighbourhoods(atomSpace)

    expect(contexts.get(hub.id)?.degree).toBe(2)
    expect(contexts.get(first.id)?.degree).toBe(1)
  })

  it('averages the truth strength of the atoms it is linked to', () => {
    const subject = atomSpace.addNode('ConceptNode', 'subject', { strength: 0.9 })
    const low = atomSpace.addNode('ConceptNode', 'low', { strength: 0.2 })
    const high = atomSpace.addNode('ConceptNode', 'high', { strength: 0.4 })
    atomSpace.addLink('AssociativeLink', [subject.id, low.id])
    atomSpace.addLink('AssociativeLink', [subject.id, high.id])

    expect(contexts(atomSpace, subject.id).neighbourhoodStrength).toBeCloseTo(0.3, 10)
  })

  it('reads an unlinked atom as agreeing with itself', () => {
    // Otherwise every disconnected atom would register as maximally
    // surprising, and cosmic-comedy would rank the emptiest part of the graph
    // highest.
    const alone = atomSpace.addNode('ConceptNode', 'alone', { strength: 0.7 })

    const context = contexts(atomSpace, alone.id)

    expect(context.degree).toBe(0)
    expect(context.neighbourhoodStrength).toBe(0.7)
    expect(AION_LENSES['cosmic-comedy'].weigh(alone, context)).toBe(0)
  })
})

function contexts(atomSpace: AtomSpace, id: string) {
  const measured = measureNeighbourhoods(atomSpace).get(id)
  if (!measured)
    throw new Error(`no neighbourhood measured for ${id}`)
  return measured
}

describe('opponent processing', () => {
  let atomSpace: AtomSpace

  beforeEach(() => {
    atomSpace = createAtomSpace({ name: 'opponent' })
    atomSpace.addNode('ConceptNode', 'familiar', { strength: 0.8, confidence: 0.5 }, { sti: 0.9 })
    atomSpace.addNode('ConceptNode', 'ignored', { strength: 0.8, confidence: 0.5 }, { sti: 0.1 })
  })

  it('looks hardest at what already matters when chaos is absent', () => {
    const result = realizeRelevance({
      atomSpace,
      lens: AION_LENSES.transcendence,
      parameters: parametersFor({ chaos: 0 }),
    })

    expect((result.ranked[0] as { name: string }).name).toBe('familiar')
  })

  it('turns toward what has been ignored when chaos is total', () => {
    const result = realizeRelevance({
      atomSpace,
      lens: AION_LENSES.transcendence,
      parameters: parametersFor({ chaos: 1 }),
    })

    expect((result.ranked[0] as { name: string }).name).toBe('ignored')
  })
})

describe('absurdity tolerance', () => {
  let atomSpace: AtomSpace

  beforeEach(() => {
    atomSpace = createAtomSpace({ name: 'absurdity' })
    atomSpace.addNode('ConceptNode', 'improbable', { strength: 0, confidence: 0.5 }, { sti: 0.5 })
    atomSpace.addNode('ConceptNode', 'likely', { strength: 1, confidence: 0.5 }, { sti: 0.5 })
  })

  it('suppresses an improbable claim entirely at zero tolerance', () => {
    const result = realizeRelevance({
      atomSpace,
      lens: AION_LENSES.transcendence,
      parameters: parametersFor({ absurdity: 0 }),
    })
    const improbable = atomSpace.getNode('ConceptNode', 'improbable')

    expect(result.scores.get(improbable!.id)).toBe(0)
  })

  it('takes an improbable claim as seriously as a likely one at full tolerance', () => {
    const result = realizeRelevance({
      atomSpace,
      lens: AION_LENSES.transcendence,
      parameters: parametersFor({ absurdity: 1 }),
    })
    const improbable = atomSpace.getNode('ConceptNode', 'improbable')
    const likely = atomSpace.getNode('ConceptNode', 'likely')

    expect(result.scores.get(improbable!.id)).toBe(result.scores.get(likely!.id))
  })
})

describe('lens fit', () => {
  it('reports no fit for a lens that cannot separate the space', () => {
    // Atoms differing only in confidence: transcendence ignores confidence and
    // so ranks them identically, while learning reads exactly that difference.
    // Fit has to score the first at zero, or a lens that says nothing would win
    // for being generous.
    const atomSpace = createAtomSpace({ name: 'fit' })
    atomSpace.addNode('ConceptNode', 'sure', { strength: 0.6, confidence: 0.9 }, { sti: 0.5 })
    atomSpace.addNode('ConceptNode', 'unsure', { strength: 0.6, confidence: 0.1 }, { sti: 0.5 })
    const parameters = parametersFor({})

    const flat = realizeRelevance({ atomSpace, lens: AION_LENSES.transcendence, parameters })
    const discriminating = realizeRelevance({ atomSpace, lens: AION_LENSES.learning, parameters })

    expect(flat.fit).toBe(0)
    expect(discriminating.fit).toBeGreaterThan(0)
  })
})

describe('empathy', () => {
  it('raises a partner contribution above an otherwise identical private thought', () => {
    const atomSpace = createAtomSpace({ name: 'empathy' })
    const theirs = atomSpace.addNode('ConceptNode', 'theirs', { strength: 0.6, confidence: 0.5 }, { sti: 0.5 })
    const mine = atomSpace.addNode('ConceptNode', 'mine', { strength: 0.6, confidence: 0.5 }, { sti: 0.5 })

    const result = realizeRelevance({
      atomSpace,
      lens: AION_LENSES.transcendence,
      parameters: parametersFor({ empathy: 0.777 }),
      partnerAtomIds: new Set([theirs.id]),
    })

    expect(result.scores.get(theirs.id)!).toBeGreaterThan(result.scores.get(mine.id)!)
  })
})
