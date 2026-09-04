import { describe, expect, it } from 'vitest'

import { createAionMind } from './aion-mind'

/**
 * The conserved quantity of the attention economy Aion runs on: everything the
 * bank still holds, plus everything it has issued onto atoms.
 */
function ledger(mind: ReturnType<typeof createAionMind>): number {
  return mind.ecan.getAttentionBank() + mind.atomSpace.getTotalSti()
}

const conversation = [
  { name: 'recursion', strength: 0.9, confidence: 0.9, relatedTo: ['self-reference'], fromPartner: true },
  { name: 'self-reference', strength: 0.5, confidence: 0.95, relatedTo: ['paradox'] },
  { name: 'paradox', strength: 0.5, confidence: 0.9 },
  { name: 'lunch', strength: 0.95, confidence: 0.2 },
]

describe('perception', () => {
  it('adds every concept it is offered', () => {
    const mind = createAionMind({ seed: 1 })

    const added = mind.perceive(conversation)

    expect(added).toHaveLength(4)
    expect(mind.atomSpace.getNode('ConceptNode', 'recursion')).toBeDefined()
    mind.dispose()
  })

  it('creates concepts named only as associations', () => {
    const mind = createAionMind({ seed: 1 })

    mind.perceive([{ name: 'humour', relatedTo: ['timing'] }])

    expect(mind.atomSpace.getNode('ConceptNode', 'timing')).toBeDefined()
    mind.dispose()
  })

  it('leaves what was just said more important than what was not', () => {
    const mind = createAionMind({ seed: 1 })
    mind.perceive([{ name: 'earlier' }])
    const earlier = mind.atomSpace.getNode('ConceptNode', 'earlier')!
    const settled = earlier.attentionValue.sti

    mind.perceive([{ name: 'later' }])
    const later = mind.atomSpace.getNode('ConceptNode', 'later')!

    expect(later.attentionValue.sti).toBeGreaterThan(settled - 1e-9)
    mind.dispose()
  })
})

describe('attention ledger under cognition', () => {
  it('balances the ledger after perceiving', () => {
    // Perception mints STI through addNode that the bank never issued, so the
    // mind has to reconcile before stimulating or thinking would quietly
    // inflate the economy.
    const mind = createAionMind({ seed: 7 })

    mind.perceive(conversation)

    expect(ledger(mind)).toBe(mind.ecan.getAttentionFunds())
    mind.dispose()
  })

  it('balances the ledger across a change of perspective', () => {
    // Reframing is a transfer, not a payment into nothing: whatever leaves the
    // bank arrives on the atoms the new lens values.
    const mind = createAionMind({ seed: 7 })
    mind.perceive(conversation)
    const funds = mind.ecan.getAttentionFunds()

    for (let round = 0; round < 12; round++) {
      mind.reframe()
      expect(ledger(mind)).toBe(funds)
    }

    mind.dispose()
  })

  it('moves importance out of the bank when it adopts a lens', () => {
    const mind = createAionMind({ seed: 3, traits: { coherence: 0, playfulness: 1 } })
    mind.perceive(conversation)
    const before = mind.ecan.getAttentionBank()

    const reframing = mind.reframe()

    if (reframing.outcome === 'switched' || reframing.outcome === 'switched-on-play') {
      expect(reframing.invested).toBeGreaterThan(0)
      expect(mind.ecan.getAttentionBank()).toBeLessThan(before)
    }
    mind.dispose()
  })
})

describe('framing under a spent budget', () => {
  it('cannot change perspective once the bank is overdrawn', () => {
    // The economy is what bounds how many perspectives Aion can inhabit. With
    // the atoms already holding more importance than was ever issued, no lens
    // can be paid for, and the mind is left in the one it has.
    //
    // Starting from transcendence matters: it is the lens that separates this
    // space least, so a better one certainly exists and the budget is the only
    // thing standing in the way. Starting from a lens that already fits would
    // return 'held' without ever consulting the bank.
    const mind = createAionMind({ seed: 5, attentionFunds: 0.05, initialLens: 'transcendence' })
    mind.perceive(conversation)
    const held = mind.currentLens().name

    expect(mind.ecan.getAttentionBank()).toBeLessThan(0)

    const reframing = mind.reframe()

    expect(reframing.outcome).toBe('budget-exhausted')
    expect(reframing.invested).toBe(0)
    expect(mind.currentLens().name).toBe(held)
    expect(mind.reflect().budgetExhausted).toBe(true)
    mind.dispose()
  })

  it('can change perspective again once inhibition returns importance', () => {
    const mind = createAionMind({ seed: 5, attentionFunds: 0.05, initialLens: 'transcendence' })
    mind.perceive(conversation)
    expect(mind.reframe().outcome).toBe('budget-exhausted')

    // Letting go of the concepts refunds the bank, which is the only way back.
    for (const atom of mind.atomSpace.getAllAtoms()) {
      mind.ecan.inhibit(atom.id, 1)
    }

    expect(mind.ecan.getAttentionBank()).toBeGreaterThan(0)
    expect(mind.reframe().outcome).not.toBe('budget-exhausted')
    mind.dispose()
  })
})

describe('reproducibility', () => {
  it('reaches the same perspective twice from the same seed', () => {
    const transcript = (seed: number) => {
      const mind = createAionMind({ seed })
      mind.perceive(conversation)
      const steps = [mind.reframe(), mind.reframe(), mind.reframe()].map(step => step.to)
      mind.dispose()
      return steps
    }

    expect(transcript(42)).toEqual(transcript(42))
  })

  it('reports a focus drawn from the concepts it was given', () => {
    const mind = createAionMind({ seed: 11 })
    mind.perceive(conversation)

    const reflection = mind.reflect()

    expect(reflection.focus.length).toBeGreaterThan(0)
    expect(reflection.lensFit).toBeGreaterThanOrEqual(0)
    expect(reflection.reframings).toBe(0)
    mind.dispose()
  })

  it('counts a reframing once it has taken one', () => {
    const mind = createAionMind({ seed: 11, traits: { coherence: 0, playfulness: 1 } })
    mind.perceive(conversation)

    const reframing = mind.reframe()
    const reflection = mind.reflect()

    if (reframing.outcome !== 'held' && reframing.outcome !== 'budget-exhausted') {
      expect(reflection.reframings).toBe(1)
      expect(reflection.lens).toBe(reframing.to)
    }
    mind.dispose()
  })
})

describe('perspective changes what is important', () => {
  it('ranks the same graph differently under opposed lenses', () => {
    // The claim the lens pairs exist to support. If two ends of an axis agreed
    // about which atom mattered most, reframing would be decoration.
    const settled = createAionMind({ seed: 2, initialLens: 'threat' })
    const curious = createAionMind({ seed: 2, initialLens: 'learning' })
    settled.perceive(conversation)
    curious.perceive(conversation)

    const underThreat = settled.attend(4).map(atom => (atom as { name?: string }).name)
    const underLearning = curious.attend(4).map(atom => (atom as { name?: string }).name)

    expect(underThreat).not.toEqual(underLearning)
    settled.dispose()
    curious.dispose()
  })
})
