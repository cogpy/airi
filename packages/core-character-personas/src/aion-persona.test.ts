import { describe, expect, it } from 'vitest'

import { createAionTraits, deriveCognitiveParameters } from './aion-persona'

describe('aion traits', () => {
  it('uses the character sheet figures by default', () => {
    const traits = createAionTraits()

    expect(traits.playfulness).toBe(0.99)
    expect(traits.chaos).toBe(0.95)
    expect(traits.empathy).toBe(0.777)
    expect(traits.absurdity).toBe(0.999)
  })

  it('clamps values that fall outside the unit interval', () => {
    const traits = createAionTraits({ playfulness: 12, coherence: -3 })

    expect(traits.playfulness).toBe(1)
    expect(traits.coherence).toBe(0)
  })

  it('keeps unspecified traits at their defaults', () => {
    const traits = createAionTraits({ chaos: 0.1 })

    expect(traits.chaos).toBe(0.1)
    expect(traits.absurdity).toBe(0.999)
  })
})

describe('aion cognitive parameters', () => {
  it('spends relevance on the unexplored in proportion to chaos', () => {
    const calm = deriveCognitiveParameters(createAionTraits({ chaos: 0 }))
    const wild = deriveCognitiveParameters(createAionTraits({ chaos: 1 }))

    expect(calm.explorationWeight).toBe(0)
    expect(wild.explorationWeight).toBe(1)
  })

  it('lets coherence and playfulness oppose each other over one threshold', () => {
    // The two traits are only genuinely in tension if they meet on a single
    // quantity. A mind that is coherent but not playful should resist a change
    // of perspective; one that is both should switch on any real improvement.
    const settled = deriveCognitiveParameters(
      createAionTraits({ coherence: 0.9, playfulness: 0.1 }),
    )
    const restless = deriveCognitiveParameters(
      createAionTraits({ coherence: 0.9, playfulness: 0.99 }),
    )

    expect(settled.switchThreshold).toBeCloseTo(0.8, 10)
    expect(restless.switchThreshold).toBe(0)
  })

  it('never makes framing free, even at maximum playfulness', () => {
    // A free perspective shift would let Aion hold every lens at once and the
    // attention budget would stop constraining anything.
    const parameters = deriveCognitiveParameters(createAionTraits({ playfulness: 1 }))

    expect(parameters.framingCost).toBeGreaterThan(0)
  })

  it('makes framing cheaper for a more playful mind', () => {
    const rigid = deriveCognitiveParameters(createAionTraits({ playfulness: 0 }))
    const fluid = deriveCognitiveParameters(createAionTraits({ playfulness: 1 }))

    expect(fluid.framingCost).toBeLessThan(rigid.framingCost)
  })

  it('raises a partner contribution above an equally important private thought', () => {
    const parameters = deriveCognitiveParameters(createAionTraits({ empathy: 0.777 }))

    expect(parameters.socialWeight).toBeGreaterThan(1)
  })
})
