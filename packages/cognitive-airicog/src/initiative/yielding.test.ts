import type { YieldState } from './yielding'

import { describe, expect, it } from 'vitest'

import { createDefaultYieldConfig, decideYield } from './yielding'

const { backchannelMs, openingGraceMs, insistentMs } = createDefaultYieldConfig()

function speaking(overrides: Partial<YieldState> = {}): YieldState {
  return {
    speaking: true,
    // Well clear of the opening grace, so tests that are not about it get past it.
    utteranceElapsedMs: 3000,
    overlapMs: 0,
    ...overrides,
  }
}

describe('decideYield', () => {
  it('has no floor to give up when it is not speaking', () => {
    expect(decideYield(speaking({ speaking: false, overlapMs: 5000 })))
      .toMatchObject({ yieldFloor: false, reason: 'not-speaking' })
  })

  it('keeps talking while nobody talks over it', () => {
    expect(decideYield(speaking()))
      .toMatchObject({ yieldFloor: false, reason: 'no-overlap' })
  })

  it('reads a brief overlap as backchannel and keeps the floor', () => {
    // An "mhm" or a laugh should not cut the character off mid-word.
    expect(decideYield(speaking({ overlapMs: backchannelMs - 1 })))
      .toMatchObject({ yieldFloor: false, reason: 'backchannel' })
  })

  it('gives up the floor once an overlap outlasts backchannel length', () => {
    expect(decideYield(speaking({ overlapMs: backchannelMs })))
      .toMatchObject({ yieldFloor: true, reason: 'interrupted' })
  })

  it('holds through overlap in the first moments of its own utterance', () => {
    // Most likely the other party finishing their turn, not contesting this one.
    expect(decideYield(speaking({
      utteranceElapsedMs: openingGraceMs - 1,
      overlapMs: backchannelMs + 100,
    }))).toMatchObject({ yieldFloor: false, reason: 'opening-grace' })
  })

  it('yields to someone who keeps talking even inside the opening grace', () => {
    // Insistence has to beat the grace period, or a determined interruption
    // during the character's first moments would be ignored outright.
    expect(decideYield(speaking({
      utteranceElapsedMs: 0,
      overlapMs: insistentMs,
    }))).toMatchObject({ yieldFloor: true, reason: 'insisted' })
  })

  it('yields to sustained speech however short backchannel tolerance is set', () => {
    expect(decideYield(
      speaking({ overlapMs: insistentMs }),
      { backchannelMs: 10_000 },
    )).toMatchObject({ yieldFloor: true, reason: 'insisted' })
  })

  it('stops at the grace boundary rather than one tick before it', () => {
    expect(decideYield(speaking({
      utteranceElapsedMs: openingGraceMs,
      overlapMs: backchannelMs,
    }))).toMatchObject({ yieldFloor: true, reason: 'interrupted' })
  })

  it('lets a character be configured to hold the floor harder', () => {
    const stubborn = { backchannelMs: 2000, insistentMs: 5000 }

    expect(decideYield(speaking({ overlapMs: 1500 }), stubborn))
      .toMatchObject({ yieldFloor: false, reason: 'backchannel' })
    expect(decideYield(speaking({ overlapMs: 5000 }), stubborn))
      .toMatchObject({ yieldFloor: true, reason: 'insisted' })
  })

  it('treats a negative overlap as no overlap at all', () => {
    expect(decideYield(speaking({ overlapMs: -100 })))
      .toMatchObject({ yieldFloor: false, reason: 'no-overlap' })
  })
})
