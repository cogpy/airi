import { describe, expect, it } from 'vitest'

import {
  activeLevels,
  crystalPeriod,
  NANOBRAIN_SCALE_SECONDS,
  phaseSignature,
  steadyStateReach,
  TIME_CRYSTAL_PERIODS,
} from './ladder'

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

describe('the period ladder', () => {
  it('places one rung on each of the neuron\'s nine timescales', () => {
    expect(TIME_CRYSTAL_PERIODS).toHaveLength(NANOBRAIN_SCALE_SECONDS.length)
  })

  it('tracks the biological periods, loosely at the fast end and closely at the slow', () => {
    // The ladder is normalized to its fastest rung, so period[l] should track
    // scale[l] / scale[0]. Rounding to primes costs most where the ratio falls
    // furthest from one — 3.25 and 6.5 are 7.7% from 3 and 7 — and almost
    // nothing on the slow rungs, which are the ones carrying the reach.
    const fastest = NANOBRAIN_SCALE_SECONDS[0]
    const errorAt = (level: number) => {
      const biological = NANOBRAIN_SCALE_SECONDS[level] / fastest
      return Math.abs(TIME_CRYSTAL_PERIODS[level] - biological) / biological
    }

    for (let level = 0; level < TIME_CRYSTAL_PERIODS.length; level++)
      expect(errorAt(level)).toBeLessThan(0.08)

    for (let level = 5; level < TIME_CRYSTAL_PERIODS.length; level++)
      expect(errorAt(level)).toBeLessThanOrEqual(0.024)
  })

  it('uses pairwise coprime periods', () => {
    for (let a = 0; a < TIME_CRYSTAL_PERIODS.length; a++) {
      for (let b = a + 1; b < TIME_CRYSTAL_PERIODS.length; b++)
        expect(greatestCommonDivisor(TIME_CRYSTAL_PERIODS[a], TIME_CRYSTAL_PERIODS[b])).toBe(1)
    }
  })

  it('leaves no rung active at the origin', () => {
    // Every period divides 0, so a zero-based token index would read as the one
    // moment the entire ladder acts together. Token counting starts at 1.
    expect(activeLevels(0)).toEqual([])
    expect(activeLevels(1)).toEqual([0])
  })

  it('reads the active set as the divisor pattern of the token index', () => {
    expect(activeLevels(21)).toEqual([0, 1, 2])
    expect(phaseSignature(21)).toBe(0b111)
    expect(activeLevels(127)).toEqual([0, 8])
    expect(phaseSignature(127)).toBe(0b1_0000_0001)
  })

  it('returns to its starting phase only after the product of its primes', () => {
    expect(crystalPeriod()).toBe(3 * 7 * 13 * 19 * 31 * 41 * 61 * 127)
    expect(crystalPeriod()).toBeGreaterThan(5e10)
  })

  it('refuses a period set whose least common multiple it cannot represent exactly', () => {
    expect(() => crystalPeriod([2 ** 40 + 1, 2 ** 40 + 3, 2 ** 40 + 7]))
      .toThrow(/exact integer range/)
  })
})

describe('coprimality versus powers of two', () => {
  // The engineering claim behind rounding to primes rather than to powers of
  // two: folds cost work, and a power-of-two ladder makes every rung fold on
  // the same tokens, so its cost arrives as a spike. Coprime periods coincide
  // only when their product divides the index, which is rare.
  const POWERS_OF_TWO = [1, 2, 4, 8, 16, 32, 64, 128, 256]
  const HORIZON = 20_000

  function activityProfile(periods: readonly number[]) {
    let peak = 0
    let total = 0
    for (let token = 1; token <= HORIZON; token++) {
      const active = activeLevels(token, periods).length
      total += active
      peak = Math.max(peak, active)
    }
    return { peak, mean: total / HORIZON }
  }

  it('never makes the whole ladder act at once, where powers of two do so repeatedly', () => {
    const prime = activityProfile(TIME_CRYSTAL_PERIODS)
    const dyadic = activityProfile(POWERS_OF_TWO)

    expect(dyadic.peak).toBe(POWERS_OF_TWO.length)
    expect(prime.peak).toBeLessThan(dyadic.peak)
  })

  it('also does less work per token on average', () => {
    const prime = activityProfile(TIME_CRYSTAL_PERIODS)
    const dyadic = activityProfile(POWERS_OF_TWO)

    expect(prime.mean).toBeLessThan(dyadic.mean)
  })
})

describe('reach', () => {
  it('grows with the sum of the periods while storage grows with the capacities', () => {
    const capacities = TIME_CRYSTAL_PERIODS.map(() => 32)
    const periodSum = TIME_CRYSTAL_PERIODS.reduce((total, period) => total + period, 0)

    expect(steadyStateReach(TIME_CRYSTAL_PERIODS, capacities)).toBe(32 * periodSum)
    expect(steadyStateReach(TIME_CRYSTAL_PERIODS, capacities)).toBe(9696)
  })
})
