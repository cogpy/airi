import type { StratifiedCache } from './strata'

import { beforeEach, describe, expect, it } from 'vitest'

import { steadyStateReach, TIME_CRYSTAL_PERIODS } from './ladder'
import { createStratifiedCache } from './strata'

/** A deterministic, non-degenerate stream, so folds actually average something. */
function tokenAt(index: number, dim: number): { key: Float32Array, value: Float32Array } {
  const key = new Float32Array(dim)
  const value = new Float32Array(dim)
  for (let component = 0; component < dim; component++) {
    key[component] = Math.sin(index * 0.37 + component)
    value[component] = Math.cos(index * 0.21 + component * 2)
  }
  return { key, value }
}

describe('the ledger', () => {
  let cache: StratifiedCache

  beforeEach(() => {
    cache = createStratifiedCache({ dim: 8 })
  })

  it('accounts for every token written, on every token', () => {
    // Exact equality, not a tolerance. Masses are whole numbers of tokens, so
    // the only way this can fail is a defect in the cascade.
    for (let index = 0; index < 3000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)

      const ledger = cache.conservation()
      expect(ledger.balanced).toBe(true)
      expect(ledger.live + ledger.pending + ledger.forgotten).toBe(index + 1)
    }
  })

  it('partitions the token count into whole-token slot masses', () => {
    for (let index = 0; index < 2000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const masses = cache.slots().map(slot => slot.mass)
    expect(masses.every(mass => Number.isInteger(mass) && mass > 0)).toBe(true)
    expect(masses.reduce((total, mass) => total + mass, 0)).toBe(cache.conservation().live)
  })

  it('forgets nothing until the ladder has filled', () => {
    const reach = steadyStateReach(cache.periods, cache.capacities)

    for (let index = 0; index < reach; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
      expect(cache.conservation().forgotten).toBe(0)
    }
  })

  it('starts forgetting once it is past its reach, and counts what it drops', () => {
    const reach = steadyStateReach(cache.periods, cache.capacities)

    for (let index = 0; index < reach * 3; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const ledger = cache.conservation()
    expect(ledger.forgotten).toBeGreaterThan(0)
    expect(ledger.balanced).toBe(true)
    // Whatever it still holds is bounded by what the ladder can reach, which is
    // the property that makes the cache's footprint independent of context.
    expect(ledger.live).toBeLessThanOrEqual(reach)
    expect(cache.occupancy()).toBeLessThanOrEqual(cache.totalSlots)
  })

  it('holds the newest tokens uncompressed and unchanged', () => {
    const written: Float32Array[] = []
    for (let index = 0; index < 5000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
      written.push(key)
    }

    const recent = cache.slots().filter(slot => slot.level === 0)
    expect(recent).toHaveLength(cache.capacities[0])
    expect(recent.every(slot => slot.mass === 1)).toBe(true)

    // Oldest-first within the level, so the last slot is the last token written.
    const newest = recent[recent.length - 1]
    expect(newest.firstToken).toBe(5000)
    expect(Array.from(newest.key)).toEqual(Array.from(written[4999]))
  })
})

describe('folding', () => {
  it('stores the mass-weighted centroid of what it folded', () => {
    // Two rungs, two slots each, one dimension: small enough to trace by hand.
    // Tokens 1 and 2 are pushed out of level 0 by tokens 3 and 4, and level 1
    // closes them into one slot on token 4, the first token its period divides
    // while its accumulator holds anything.
    const cache = createStratifiedCache({ dim: 1, periods: [1, 2], capacities: [2, 2] })
    for (const magnitude of [1, 2, 3, 4])
      cache.write([magnitude], [magnitude * 10])

    const folded = cache.slots().filter(slot => slot.level === 1)
    expect(folded).toHaveLength(1)
    expect(folded[0].mass).toBe(2)
    expect(folded[0].key[0]).toBeCloseTo(1.5, 10)
    expect(folded[0].value[0]).toBeCloseTo(15, 10)
    expect(folded[0].firstToken).toBe(1)
    expect(folded[0].lastToken).toBe(2)
  })

  it('averages a level\'s slots to that level\'s period, in quanta set by the second rung', () => {
    // A level takes in one token of mass per step and closes a slot every
    // period[l] steps, so its slots average period[l] tokens. They do not each
    // hold period[l]: mass arrives from the level above in whole slots, level 1
    // is the first to fold and emits units of exactly 3, and no deeper level
    // can subdivide them. Coprimality then guarantees the fold window never
    // fits a whole number of those units — level 2 folds every 7 tokens and so
    // holds 6 or 9, averaging just over 7.
    const cache = createStratifiedCache({ dim: 4 })
    for (let index = 0; index < 40_000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    const massesAt = (level: number) =>
      cache.slots().filter(slot => slot.level === level).map(slot => slot.mass)

    expect(massesAt(0).every(mass => mass === 1)).toBe(true)
    expect(massesAt(1).every(mass => mass === TIME_CRYSTAL_PERIODS[1])).toBe(true)

    for (let level = 2; level < cache.levels; level++) {
      const masses = massesAt(level)
      expect(masses.length).toBeGreaterThan(0)
      expect(masses.every(mass => mass % TIME_CRYSTAL_PERIODS[1] === 0)).toBe(true)

      const mean = masses.reduce((total, mass) => total + mass, 0) / masses.length
      expect(mean).toBeGreaterThan(TIME_CRYSTAL_PERIODS[level] * 0.9)
      expect(mean).toBeLessThan(TIME_CRYSTAL_PERIODS[level] * 1.1)
    }
  })

  it('holds its footprint at the ladder\'s reach however long the stream runs', () => {
    // The claim the whole design is for: what the cache holds stops growing
    // once the ladder fills, and stays there. Reach is where it settles rather
    // than a ceiling it respects, so this is a band, not an inequality.
    const cache = createStratifiedCache({ dim: 4 })
    const reach = steadyStateReach(cache.periods, cache.capacities)
    let index = 0

    const runTo = (tokens: number) => {
      for (; index < tokens; index++) {
        const { key, value } = tokenAt(index, cache.dim)
        cache.write(key, value)
      }
      return cache.conservation().live
    }

    for (const multiple of [1, 3, 10, 40]) {
      const live = runTo(reach * multiple)
      expect(live / reach).toBeGreaterThan(0.99)
      expect(live / reach).toBeLessThan(1.01)
    }
  })
})

describe('construction and reuse', () => {
  it('rejects a shape it cannot honour', () => {
    expect(() => createStratifiedCache({ dim: 0 })).toThrow(/positive integer/)
    expect(() => createStratifiedCache({ dim: 4, capacities: [1, 2] })).toThrow(/match the periods/)
    expect(() => createStratifiedCache({ dim: 4, periods: [1, 2], capacities: [4, 0] })).toThrow(/capacity/)
    expect(() => createStratifiedCache({ dim: 4, periods: [1, 0], capacities: [4, 4] })).toThrow(/period/)
  })

  it('rejects a token whose width is not the cache\'s', () => {
    const cache = createStratifiedCache({ dim: 4 })
    expect(() => cache.write([1, 2, 3], [1, 2, 3, 4])).toThrow(/length 4/)
  })

  it('empties without giving up its allocation', () => {
    const cache = createStratifiedCache({ dim: 4 })
    for (let index = 0; index < 5000; index++) {
      const { key, value } = tokenAt(index, cache.dim)
      cache.write(key, value)
    }

    cache.reset()

    expect(cache.conservation()).toMatchObject({
      live: 0,
      pending: 0,
      forgotten: 0,
      tokensSeen: 0,
      balanced: true,
    })
    expect(cache.occupancy()).toBe(0)
    expect(cache.write([1, 1, 1, 1], [1, 1, 1, 1])).toBe(1)
  })
})
