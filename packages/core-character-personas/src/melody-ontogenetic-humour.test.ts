import type { HumourContext, LayeredJoke, MelodyHumourGenome } from './melody-ontogenetic-humour'

import { describe, expect, it } from 'vitest'

import {
  constructLayeredJoke,
  createMelodyHumourGenome,
  detectHumourOpportunity,
  evaluateJokeFitness,
  evolveHumourGenome,
} from './melody-ontogenetic-humour'

// Every gene gates a `Math.random()` comparison, so the tests pin the relevant
// gene to 0 or 1 to force one side of that comparison and stay deterministic.
function genomeWith(overrides: Partial<MelodyHumourGenome>): MelodyHumourGenome {
  return { ...createMelodyHumourGenome(), ...overrides }
}

function contextWith(overrides: Partial<HumourContext>): HumourContext {
  return {
    message: 'Check out my new gaming setup!',
    emotionalTone: 'playful',
    audienceComfort: 0.8,
    ...overrides,
  }
}

function jokeWith(overrides: Partial<LayeredJoke>): LayeredJoke {
  return {
    wholesome: 'You\'re doing great! Keep it up! 💜',
    emojis: ['💜'],
    deliveryTiming: 500,
    ...overrides,
  }
}

describe('createMelodyHumourGenome', () => {
  it('starts from the documented ontogenetic defaults', () => {
    expect(createMelodyHumourGenome()).toEqual({
      sarcasticDelivery: 0.65,
      innuendoDetection: 0.70,
      innuendoConstruction: 0.70,
      crazyHumourTrigger: 0.72,
      comedicTimingOptimization: 0.75,
      authenticityPreservation: 0.95,
    })
  })

  it('hands out an independent genome on each call', () => {
    const first = createMelodyHumourGenome()
    const second = createMelodyHumourGenome()

    first.sarcasticDelivery = 0.1

    expect(second.sarcasticDelivery).toBe(0.65)
  })
})

describe('detectHumourOpportunity', () => {
  it('sees an opportunity whenever the tone is playful and the audience is comfortable', () => {
    // crazyHumourTrigger 0 turns the spontaneity branch off, isolating the
    // playful-and-comfortable path.
    const genome = genomeWith({ crazyHumourTrigger: 0 })

    expect(detectHumourOpportunity(contextWith({ audienceComfort: 0.8 }), genome)).toBe(true)
  })

  it('fires the spontaneity branch even outside a playful context when the crazy gene is maxed', () => {
    const context = contextWith({ emotionalTone: 'supportive', audienceComfort: 0.2 })

    expect(detectHumourOpportunity(context, genomeWith({ crazyHumourTrigger: 1 }))).toBe(true)
  })

  it('stays quiet outside a playful context when the crazy gene is zero', () => {
    const context = contextWith({ emotionalTone: 'supportive', audienceComfort: 0.2 })

    expect(detectHumourOpportunity(context, genomeWith({ crazyHumourTrigger: 0 }))).toBe(false)
  })
})

describe('constructLayeredJoke', () => {
  it('always produces a wholesome layer carrying the caring heart', () => {
    const joke = constructLayeredJoke(contextWith({}), createMelodyHumourGenome())

    expect(joke.wholesome.length).toBeGreaterThan(0)
    expect(joke.emojis).toContain('💜')
    expect(joke.deliveryTiming).toBeGreaterThan(0)
  })

  it('withholds sarcasm and innuendo from an uncomfortable audience', () => {
    // Sarcasm needs comfort > 0.6 and innuendo > 0.7, so maxed genes still
    // cannot unlock either layer at 0.1.
    const genome = genomeWith({
      sarcasticDelivery: 1,
      innuendoDetection: 1,
      innuendoConstruction: 1,
    })

    const joke = constructLayeredJoke(contextWith({ audienceComfort: 0.1 }), genome)

    expect(joke.sarcastic).toBeUndefined()
    expect(joke.innuendo).toBeUndefined()
    expect(joke.wholesome.length).toBeGreaterThan(0)
  })

  it('layers sarcasm and innuendo when both the genes and the audience allow it', () => {
    const genome = genomeWith({
      sarcasticDelivery: 1,
      innuendoDetection: 1,
      innuendoConstruction: 1,
    })

    const joke = constructLayeredJoke(contextWith({ audienceComfort: 1 }), genome)

    expect(joke.sarcastic).toBeTruthy()
    expect(joke.innuendo).toBeTruthy()
    expect(joke.emojis).toEqual(['💜', '😏', '😇', '🔥'])
  })
})

describe('evaluateJokeFitness', () => {
  it('scores a well-received, boundary-respecting joke at full fitness', () => {
    const fitness = evaluateJokeFitness(jokeWith({}), {
      laughed: true,
      positiveReaction: true,
      comfortable: true,
    })

    expect(fitness.boundariesRespected).toBe(true)
    expect(fitness.overallScore).toBeCloseTo(1.0)
  })

  it('zeroes the score when the audience was left uncomfortable', () => {
    const fitness = evaluateJokeFitness(jokeWith({}), {
      laughed: true,
      positiveReaction: true,
      comfortable: false,
    })

    expect(fitness.boundariesRespected).toBe(false)
    expect(fitness.overallScore).toBe(0)
  })

  it('zeroes the score when the wholesome layer itself trips the explicit-content filter', () => {
    const fitness = evaluateJokeFitness(jokeWith({ wholesome: 'that was a vulgar take' }), {
      laughed: true,
      positiveReaction: true,
      comfortable: true,
    })

    expect(fitness.wholesomeMaintained).toBe(false)
    expect(fitness.overallScore).toBe(0)
  })

  it('keeps the base score for respecting boundaries when nobody laughed', () => {
    const fitness = evaluateJokeFitness(jokeWith({}), {
      laughed: false,
      positiveReaction: false,
      comfortable: true,
    })

    expect(fitness.authenticLaughter).toBe(0)
    expect(fitness.overallScore).toBeCloseTo(0.2)
  })
})

describe('evolveHumourGenome', () => {
  const success = evaluateJokeFitness(jokeWith({}), {
    laughed: true,
    positiveReaction: true,
    comfortable: true,
  })

  const failure = evaluateJokeFitness(jokeWith({}), {
    laughed: false,
    positiveReaction: false,
    comfortable: false,
  })

  it('reinforces the trait behind a joke that landed', () => {
    const genome = createMelodyHumourGenome()

    const evolved = evolveHumourGenome(genome, success, 'sarcastic')

    expect(evolved.sarcasticDelivery).toBeCloseTo(0.70)
    expect(evolved.comedicTimingOptimization).toBeCloseTo(0.775)
    expect(evolved.innuendoConstruction).toBe(genome.innuendoConstruction)
  })

  it('weakens the trait behind a joke that failed', () => {
    const evolved = evolveHumourGenome(createMelodyHumourGenome(), failure, 'innuendo')

    expect(evolved.innuendoConstruction).toBeCloseTo(0.65)
  })

  it('never lets authenticity slip below the 0.95 floor', () => {
    const evolved = evolveHumourGenome(
      genomeWith({ authenticityPreservation: 0.5 }),
      failure,
      'crazy',
    )

    expect(evolved.authenticityPreservation).toBe(0.95)
  })

  it('leaves the genome it was given untouched', () => {
    const genome = createMelodyHumourGenome()
    const before = { ...genome }

    evolveHumourGenome(genome, success, 'crazy')

    expect(genome).toEqual(before)
  })
})
