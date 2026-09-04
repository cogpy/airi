import { describe, expect, it } from 'vitest'

import { fromQuanta, QUANTA_PER_UNIT, quantizeAttention, toQuanta } from './quanta'

describe('attention quantum lattice', () => {
  /**
   * @example QUANTA_PER_UNIT // => 1048576
   */
  it('uses a power-of-two subdivision so lattice points are exact in float64', () => {
    expect(Number.isInteger(Math.log2(QUANTA_PER_UNIT))).toBe(true)
  })

  describe('toQuanta', () => {
    /**
     * @example toQuanta(1) // => 1048576
     */
    it('counts whole quanta in an importance value', () => {
      expect(toQuanta(1)).toBe(QUANTA_PER_UNIT)
      expect(toQuanta(0.5)).toBe(QUANTA_PER_UNIT / 2)
      expect(toQuanta(0)).toBe(0)
    })

    /**
     * @example toQuanta(Number.NaN) // => 0
     */
    it('projects non-finite input to zero rather than poisoning the ledger', () => {
      expect(toQuanta(Number.NaN)).toBe(0)
      expect(toQuanta(Number.POSITIVE_INFINITY)).toBe(0)
    })
  })

  describe('fromQuanta', () => {
    /**
     * @example fromQuanta(524288) // => 0.5
     */
    it('is the inverse of toQuanta on lattice points', () => {
      expect(fromQuanta(toQuanta(0.5))).toBe(0.5)
      expect(fromQuanta(toQuanta(0.25))).toBe(0.25)
    })
  })

  describe('quantizeAttention', () => {
    /**
     * @example quantizeAttention(0.1 + 0.2) // => 0.30000019073486328
     */
    it('is idempotent, so a value never drifts by being re-projected', () => {
      const once = quantizeAttention(0.1 + 0.2)
      expect(quantizeAttention(once)).toBe(once)
    })

    /**
     * @example quantizeAttention(0.1) + quantizeAttention(0.2) // exact
     */
    it('makes addition and subtraction exact where raw floats drift', () => {
      // The motivating failure: raw float arithmetic does not round-trip, so a
      // ledger built on it invents or destroys currency over time.
      expect(0.1 + 0.2 - 0.2).not.toBe(0.1)

      const a = quantizeAttention(0.1)
      const b = quantizeAttention(0.2)
      expect(a + b - b).toBe(a)
    })

    /**
     * @example many partial transfers still sum to the original total
     */
    it('conserves a total split into many quantised parts', () => {
      const total = quantizeAttention(1)
      let remaining = total
      let moved = 0

      for (let i = 0; i < 500; i++) {
        const part = quantizeAttention(remaining * 0.017)
        remaining = quantizeAttention(remaining - part)
        moved = quantizeAttention(moved + part)
      }

      expect(remaining + moved).toBe(total)
    })
  })
})
